import{createClient}from'npm:@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const schema={type:'object',additionalProperties:false,required:['subject_line','body','note'],properties:{subject_line:{type:'string'},body:{type:'string'},note:{type:'string'}}};

function outputText(data:any){if(typeof data?.output_text==='string')return data.output_text;for(const item of data?.output??[])for(const content of item?.content??[])if(typeof content?.text==='string')return content.text;return''}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
  const auth=req.headers.get('Authorization');if(!auth)throw new Error('Missing authorization');
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');if(!url||!anon)throw new Error('Missing Supabase environment variables');
  const supabase=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const input=await req.json();if(!input?.body?.trim())throw new Error('Message body required');
  const [{data:offer,error:oe},{data:motive,error:me},semanticResult]=await Promise.all([
    supabase.from('lms_offers').select('name,description,offer_type,location,start_date,end_date,price,currency').eq('id',input.offer_id).maybeSingle(),
    input.motive_id?supabase.from('lms_motives').select('name,description,hypothesis').eq('id',input.motive_id).maybeSingle():Promise.resolve({data:null,error:null}),
    input.message_id?supabase.from('lms_message_semantics').select('*').eq('message_id',input.message_id).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(oe)throw new Error(`Offer lookup failed: ${oe.message}`);if(me)throw new Error(`Motive lookup failed: ${me.message}`);if(semanticResult.error)throw new Error(`Semantic lookup failed: ${semanticResult.error.message}`);
  const apiKey=Deno.env.get('OPENAI_API_KEY'),model=Deno.env.get('OPENAI_MODEL');if(!apiKey||!model)throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL as Supabase Edge Function secrets');
  const prompt=`You are an elite direct-response editor working inside a message-testing simulator. Improve the supplied email while preserving all facts and the author's recognizable voice.

VOICE RULES:
- Write in natural prose paragraphs. Never use one-sentence-per-line LinkedIn poetry.
- Smart, anecdotal, conversational, concise, curious, confident, slightly witty.
- Avoid corporate jargon, hype, motivational-speaker language and generic marketing copy.
- Never use the rhetorical construction "not because X, but because Y" or close variants. Do not create contrast by repeatedly saying what something is not.
- Let observations and anecdotes create the insight. Do not over-explain.
- Keep useful specificity: dates, price, places, audience, constraints and CTA when present.
- Preserve personalization tokens exactly, including *|FNAME|*.
- Improve subject-line open pull, credibility, relevance, practical value, risk reduction and CTA while reducing sales smell.
- Do not invent names, companies, testimonials, meetings, itinerary items or outcomes.
- The resulting email should feel written by Niki, not by an AI copywriter.

OFFER:\n${JSON.stringify(offer)}\n\nMOTIVE:\n${JSON.stringify(motive)}\n\nLATEST SEMANTIC ASSESSMENT:\n${JSON.stringify(semanticResult.data)}\n\nCURRENT SUBJECT:\n${input.subject_line??''}\n\nCURRENT BODY:\n${input.body}\n
Return one improved subject line, the complete improved body, and one short note explaining the main improvement. Do not include markdown fences.`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({model,input:prompt,text:{format:{type:'json_schema',name:'improved_message',strict:true,schema}}})});
  const rawText=await response.text();let raw:any=null;try{raw=JSON.parse(rawText)}catch{throw new Error(`OpenAI returned non-JSON (${response.status}): ${rawText.slice(0,240)}`)}
  if(!response.ok)throw new Error(`OpenAI error ${response.status}: ${raw?.error?.message??rawText.slice(0,240)}`);
  const text=outputText(raw);if(!text)throw new Error('Model returned no improved message');
  let parsed:any;try{parsed=JSON.parse(text)}catch{throw new Error(`Model returned invalid JSON: ${text.slice(0,240)}`)}
  return new Response(JSON.stringify(parsed),{status:200,headers:{...cors,'Content-Type':'application/json'}});
}catch(error){const message=error instanceof Error?error.message:String(error);console.error('improve-message failed:',message);return new Response(JSON.stringify({error:message}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}});
