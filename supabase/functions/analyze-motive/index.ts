import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const scoreKeys = [
  "audience_fit",
  "current_belief_alignment",
  "insight_novelty",
  "perceived_truth",
  "worldview_shift",
  "identity_compatibility",
  "evidence_strength",
] as const;
const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    ...scoreKeys,
    "analysis_summary",
    "recommendation",
    "validation_status",
  ],
  properties: {
    ...Object.fromEntries(
      scoreKeys.map((k) => [k, { type: "integer", minimum: 0, maximum: 100 }]),
    ),
    analysis_summary: { type: "string" },
    recommendation: { type: "string" },
    validation_status: {
      type: "string",
      enum: ["weak", "promising", "synthetically_validated"],
    },
  },
};
function textOf(x: any) {
  if (typeof x?.output_text === "string") return x.output_text;
  for (const i of x?.output ?? [])
    for (const c of i?.content ?? [])
      if (typeof c?.text === "string") return c.text;
  return "";
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
    const { motive_id } = await req.json();
    const { data: motive, error: me } = await db
      .from("lms_motives")
      .select("*")
      .eq("id", motive_id)
      .single();
    if (me) throw me;
    const segments = motive.target_segments?.length
      ? motive.target_segments
      : ["cxo", "consultant", "corporate_refugee"];
    const samples = await Promise.all(
      segments.map((segment: string) =>
        db
          .from("lms_people")
          .select(
            "audience_segment,job_title,industry,primary_tension,secondary_tension,aspiration,curiosity,skepticism,challenge_deficit,agency_frustration,reinvention_readiness,evidence_need",
          )
          .eq("audience_segment", segment)
          .order("id")
          .limit(12),
      ),
    );
    const sampleError = samples.find((result) => result.error)?.error;
    if (sampleError) throw sampleError;
    const people = samples.flatMap((result) => result.data ?? []);
    const apiKey = Deno.env.get("OPENAI_API_KEY"),
      model = Deno.env.get("OPENAI_MODEL");
    if (!apiKey || !model)
      throw new Error(
        "Set OPENAI_API_KEY and OPENAI_MODEL as Edge Function secrets",
      );
    const prompt = `Act as a skeptical hypothesis evaluator. Determine whether the assumed motive and current belief plausibly fit this synthetic audience before any offer or copy exists. Do not evaluate writing quality. Distinguish a familiar truth from a genuinely useful insight. Evidence strength must reflect only supplied evidence. Never call synthetic evidence real-world validation.

HYPOTHESIS:\n${JSON.stringify(motive)}\n\nREPRESENTATIVE SYNTHETIC AUDIENCE RECORDS:\n${JSON.stringify(people)}\n\nReturn the scores, a concise explanation, the biggest correction needed, and a validation status.`;
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
            name: "hypothesis_assessment",
            strict: true,
            schema,
          },
        },
      }),
    });
    const raw = await r.json();
    if (!r.ok)
      throw new Error(raw?.error?.message ?? `OpenAI error ${r.status}`);
    const parsed = JSON.parse(textOf(raw));
    const { data: updated, error: ue } = await db
      .from("lms_motives")
      .update({
        ...parsed,
        analysis_source: "llm",
        model_name: model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", motive_id)
      .select("*")
      .single();
    if (ue) throw ue;
    return new Response(JSON.stringify({ motive: updated }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
