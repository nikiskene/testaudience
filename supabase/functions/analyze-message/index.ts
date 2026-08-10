import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const keys = [
  'curiosity_gap','specificity','credibility','novelty','intellectual_tension','personal_relevance','usefulness','urgency','emotional_resonance','sales_smell','risk_reduction','social_proof','identity_relevance','fear_pressure','opportunity_pull','proposition_clarity','cta_strength','narrative_pull','subject_open_pull',
] as const;

const properties: Object = Object.fromEntries(
  keys.map((k) => [k, { type: 'integer', minimum: 0, maximum: 100 }]),
);

const schema = {
  type: 'object',
  additionalProperties: false,
  required: [...keys, 'summary', 'key_themes'],
  properties: {
    ...properties,
    summary: { type: 'string' },
    key_themes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  },
};

function outputText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

async function callOpenAI(apiKey: string, model: string, prompt: string) {
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'semantic_profile',
            strict: true,
            schema,
          },
        },
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const rawText = await response.text();
    let data: any = null;

    if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
      try {
        data = JSON.parse(rawText);
      } catch (error) {
        lastError = `OpenAI returned invalid JSON (${response.status}, ${contentType || 'unknown content-type'}): ${rawText.slice(0, 240)}`;
      }
    } else {
      lastError = `OpenAI returned non-JSON (${response.status}, ${contentType || 'unknown content-type'}): ${rawText.slice(0, 240)}`;
    }

    if (response.ok && data) return data;

    if (data?.error?.message) {
      lastError = `OpenAI error ${response.status}: ${data.error.message}`;
    } else if (!lastError) {
      lastError = `OpenAI error ${response.status}`;
    }

    const retryable = response.status >= 500 || response.status === 429 || !data;
    if (!retryable || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  throw new Error(lastError || 'OpenAI request failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Missing authorization');

    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anon) throw new Error('Missing Supabase environment variables');

    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });

    const { message_id } = await req.json();
    if (!message_id) throw new Error('message_id required');

    const { data: message, error: messageError } = await supabase
      .from('lms_messages')
      .select('*')
      .eq('id', message_id)
      .single();
    if (messageError) throw new Error(`Message lookup failed: ${messageError.message}`);

    const [offerResult, motiveResult] = await Promise.all([
      supabase
        .from('lms_offers')
        .select('name,description,offer_type,location,start_date,end_date,price,currency')
        .eq('id', message.offer_id)
        .maybeSingle(),
      message.motive_id
        ? supabase
            .from('lms_motives')
            .select('name,description,hypothesis')
            .eq('id', message.motive_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (offerResult.error) throw new Error(`Offer lookup failed: ${offerResult.error.message}`);
    if (motiveResult.error) throw new Error(`Motive lookup failed: ${motiveResult.error.message}`);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_MODEL');
    if (!apiKey || !model) {
      throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL as Supabase Edge Function secrets');
    }

    const prompt = `You are the semantic interpreter for a synthetic-market simulator. Analyze meaning, not marketing quality in the abstract. Read the subject and body as a busy skeptical senior professional would encounter them. Score each dimension 0-100. A score is descriptive, not flattering. sales_smell means how strongly it feels like familiar promotional copy. subject_open_pull means intrinsic probability pressure created by the subject itself before reading the body. personal_relevance means how clearly the text connects to a reader's current work/life problem without knowing a specific persona. intellectual_tension measures paradox, contradiction or unresolved thought. risk_reduction measures how much the proposition reduces perceived downside. Return a concise summary and up to 8 semantic themes.\n\nOFFER:\n${JSON.stringify(offerResult.data)}\n\nMOTIVE:\n${JSON.stringify(motiveResult.data)}\n\nSUBJECT:\n${message.subject_line}\n\nBODY:\n${message.body}`;

    const raw = await callOpenAI(apiKey, model, prompt);
    const text = outputText(raw);
    if (!text) {
      console.error('OpenAI raw response:', JSON.stringify(raw));
      throw new Error('Semantic model returned no text');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Semantic model returned invalid JSON: ${text.slice(0, 240)}`);
    }

    const payload = {
      message_id,
      ...parsed,
      analysis_source: 'llm',
      model_name: model,
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: profileError } = await supabase
      .from('lms_message_semantics')
      .upsert(payload, { onConflict: 'message_id' })
      .select('*')
      .single();
    if (profileError) throw new Error(`Semantic profile save failed: ${profileError.message}`);

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('analyze-message failed:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
