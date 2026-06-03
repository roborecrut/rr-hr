// Unified candidate evaluation: resume | checklist | situations | training_block
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { aiChat, tryParseJson } from "../_shared/ai.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Mode = "resume" | "checklist" | "situations" | "training_block";

const PROMPTS: Record<Mode, string> = {
  resume:
    "Ты — HR-эксперт. По тексту резюме и описанию вакансии оцени соответствие. Верни JSON: {score:0..100, summary:string, strengths:string[], gaps:string[]}.",
  checklist:
    "Ты — оценщик ответов кандидата на чек-лист вопросов. Верни JSON: {items:[{question_id,score:0..100,is_correct,feedback}], total:0..100}.",
  situations:
    "Ты — оценщик ролевых сценариев. Верни JSON: {items:[{question_id,score:0..100,feedback}], total:0..100, advice:string}.",
  training_block:
    "Ты — оценщик учебного блока. Верни JSON: {lessons:[{lesson_id,score:0..100,feedback}], block_score:0..100, summary:string}.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    mode: Mode;
    candidate_id?: string;
    project_id?: string;
    payload: unknown; // free-form context per mode
  };
  if (!body?.mode || !body.payload) return jsonResponse({ error: "bad_body" }, 400);

  try {
    const { text, raw } = await aiChat({
      json: true,
      messages: [
        { role: "system", content: PROMPTS[body.mode] },
        { role: "user", content: JSON.stringify(body.payload) },
      ],
    });
    const obj = tryParseJson(text) ?? { raw: text };

    try {
      const url = Deno.env.get("SUPABASE_URL");
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && svc) {
        const admin = createClient(url, svc);
        await admin.from("ai_runs").insert({
          endpoint: `ai-evaluate/${body.mode}`,
          model: raw?.model ?? "google/gemini-2.5-flash",
          input: body.payload,
          output: obj,
          tokens_in: raw?.usage?.prompt_tokens ?? null,
          tokens_out: raw?.usage?.completion_tokens ?? null,
          candidate_id: body.candidate_id ?? null,
          project_id: body.project_id ?? null,
        });
      }
    } catch (_) { /* ignore */ }

    return jsonResponse({ result: obj });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});