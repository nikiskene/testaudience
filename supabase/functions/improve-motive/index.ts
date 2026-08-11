import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "current_belief",
    "desired_belief",
    "core_insight",
    "evidence",
    "note",
  ],
  properties: {
    current_belief: { type: "string" },
    desired_belief: { type: "string" },
    core_insight: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    note: { type: "string" },
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
    const { motive_id, direction } = await req.json();
    if (!direction?.trim()) throw new Error("Improvement direction required");
    const { data: motive, error } = await db
      .from("lms_motives")
      .select("*")
      .eq("id", motive_id)
      .single();
    if (error) throw error;
    const apiKey = Deno.env.get("OPENAI_API_KEY"),
      model = Deno.env.get("OPENAI_MODEL");
    if (!apiKey || !model) throw new Error("Set OpenAI secrets");
    const prompt = `Improve the hypothesis according to the user's direction and its assessment. Make beliefs observable and falsifiable. Preserve factual evidence; never invent proof. Return a proposal only; the user will review before saving.\n\nCURRENT:\n${JSON.stringify(motive)}\n\nDIRECTION:\n${direction}`;
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
            name: "improved_hypothesis",
            strict: true,
            schema,
          },
        },
      }),
    });
    const raw = await r.json();
    if (!r.ok)
      throw new Error(raw?.error?.message ?? `OpenAI error ${r.status}`);
    return new Response(JSON.stringify(JSON.parse(textOf(raw))), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
