import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const keys = [
  "curiosity_gap",
  "specificity",
  "credibility",
  "novelty",
  "intellectual_tension",
  "personal_relevance",
  "usefulness",
  "urgency",
  "emotional_resonance",
  "sales_smell",
  "risk_reduction",
  "social_proof",
  "identity_relevance",
  "fear_pressure",
  "opportunity_pull",
  "proposition_clarity",
  "cta_strength",
  "narrative_pull",
  "subject_open_pull",
  "current_belief_alignment",
  "insight_novelty",
  "perceived_truth",
  "worldview_shift",
  "identity_compatibility",
  "evidence_strength",
  "offer_clarity",
  "offer_fit",
  "offer_desirability",
  "offer_credibility",
  "offer_urgency",
  "offer_risk",
  "offer_roi",
  "copy_subject",
  "hook_strength",
  "readability",
  "authenticity",
  "story_flow",
] as const;
const schema = {
  type: "object",
  additionalProperties: false,
  required: [...keys, "summary", "diagnosis", "key_themes"],
  properties: {
    ...Object.fromEntries(
      keys.map((k) => [k, { type: "integer", minimum: 0, maximum: 100 }]),
    ),
    summary: { type: "string" },
    diagnosis: { type: "string" },
    key_themes: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
};
function outputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? [])
    for (const content of item?.content ?? [])
      if (typeof content?.text === "string") return content.text;
  return "";
}
async function ask(apiKey: string, model: string, prompt: string) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "belief_offer_copy_assessment",
          strict: true,
          schema,
        },
      },
    }),
  });
  const raw = await r.json();
  if (!r.ok) throw new Error(raw?.error?.message ?? `OpenAI error ${r.status}`);
  const text = outputText(raw);
  if (!text) throw new Error("Semantic model returned no assessment");
  return JSON.parse(text);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Missing authorization");
    const url = Deno.env.get("SUPABASE_URL"),
      anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon)
      throw new Error("Missing Supabase environment variables");
    const db = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { message_id } = await req.json();
    if (!message_id) throw new Error("message_id required");
    const { data: message, error: me } = await db
      .from("lms_messages")
      .select("*")
      .eq("id", message_id)
      .single();
    if (me) throw me;
    const [{ data: offer, error: oe }, { data: motive, error: moe }] =
      await Promise.all([
        db.from("lms_offers").select("*").eq("id", message.offer_id).single(),
        message.motive_id
          ? db
              .from("lms_motives")
              .select("*")
              .eq("id", message.motive_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (oe) throw oe;
    if (moe) throw moe;
    const apiKey = Deno.env.get("OPENAI_API_KEY"),
      model = Deno.env.get("OPENAI_MODEL");
    if (!apiKey || !model)
      throw new Error(
        "Set OPENAI_API_KEY and OPENAI_MODEL as Edge Function secrets",
      );
    const prompt = `You assess a campaign in three strictly separate stages. Never reward good copy for a false hypothesis, and never punish a strong hypothesis merely because the offer or prose is weak.

STAGE 1 — BELIEF: Does the stated current belief fit the target audience? Is the core insight new, true, identity-compatible and supported by evidence? Score belief fields independently.
STAGE 2 — OFFER: Only after belief assessment, decide whether the offer logically delivers on the desired belief. Score clarity, fit, desirability, credibility, urgency, risk (100 means high risk), ROI and CTA.
STAGE 3 — COPY: Only then assess subject, hook, readability, emotional pull, authenticity and story flow.

The diagnosis must name the primary failure layer: hypothesis, evidence, offer or copy. Scores are descriptive, skeptical and 0-100.

HYPOTHESIS:\n${JSON.stringify(motive)}\n\nOFFER:\n${JSON.stringify(offer)}\n\nSUBJECT:\n${message.subject_line}\n\nBODY:\n${message.body}\n\nP.S.:\n${message.ps ?? ""}`;
    const parsed = await ask(apiKey, model, prompt);
    const payload = {
      message_id,
      ...parsed,
      analysis_source: "llm",
      model_name: model,
      updated_at: new Date().toISOString(),
    };
    const { data: profile, error: pe } = await db
      .from("lms_message_semantics")
      .upsert(payload, { onConflict: "message_id" })
      .select("*")
      .single();
    if (pe) throw pe;
    return new Response(JSON.stringify({ profile }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
