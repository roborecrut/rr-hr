// Unified candidate evaluation via ProTalk: resume | checklist | situations | training_block
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk, tryParseJson, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb,
} from "../_shared/protalk.ts";
import { requireEmployerJwt, assertProjectOwner, assertCandidateOwner } from "../_shared/auth.ts";

type Mode = "resume" | "checklist" | "situations" | "training_block" | "overall_candidate";

const PROMPTS: Record<Mode, string> = {
  resume:
    "Ты — HR-эксперт. По тексту резюме и описанию вакансии оцени соответствие. Верни ТОЛЬКО JSON: {score:0..100, summary:string, strengths:string[], gaps:string[]}. Без markdown.",
  checklist:
    "Ты — оценщик ответов кандидата на чек-лист вопросов. Верни ТОЛЬКО JSON: {items:[{question_id,score:0..100,is_correct,feedback}], total:0..100}. Без markdown.",
  situations:
    "Ты — оценщик ролевых сценариев. Верни ТОЛЬКО JSON: {items:[{question_id,score:0..100,feedback}], total:0..100, advice:string}. Без markdown.",
  training_block:
    "Ты — оценщик учебного блока. Верни ТОЛЬКО JSON: {lessons:[{lesson_id,score:0..100,feedback}], block_score:0..100, summary:string}. Без markdown.",
  overall_candidate:
    "Ты — senior HRD и эксперт по оценке кандидатов. Оцени кандидата комплексно: резюме, ответы анкеты, ролевые ситуации, числовые оценки, требования вакансии, задачи, мотивацию, критерии работодателя и риски найма. Не пересказывай только резюме. Дай деловую экспертную рекомендацию: подходит/частично/не подходит, почему, сильные стороны, риски, что уточнить на финальном интервью. Верни ТОЛЬКО JSON: {score:0..100, verdict:string, summary:string, strengths:string[], risks:string[], interview_focus:string[]}. summary — 8-12 содержательных предложений на русском языке. Без markdown.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    mode: Mode;
    candidate_id?: string;
    project_id?: string;
    payload: unknown;
  };
  if (!body?.mode || !body.payload) return jsonResponse({ error: "bad_body" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  if (body.candidate_id) {
    const own = await assertCandidateOwner({ userId: auth.userId, candidateId: body.candidate_id });
    if (own instanceof Response) return own;
  } else if (body.project_id) {
    const own = await assertProjectOwner({ userId: auth.userId, projectId: body.project_id });
    if (own instanceof Response) return own;
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  try {
    const { text, raw } = await callProTalk({
      messages: [
        { role: "system", content: PROMPTS[body.mode] },
        { role: "user", content: JSON.stringify(body.payload) },
      ],
      chatId, socialId,
    });
    const obj = tryParseJson(text) ?? { raw: text };
    await logToDb({
      user_message: `evaluate.${body.mode}`,
      bot_reply: typeof text === "string" ? text : JSON.stringify(obj),
      channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-evaluate:${body.mode}`, server_name: "ai-evaluate",
      function_call_params: JSON.stringify({ candidate_id: body.candidate_id, project_id: body.project_id }),
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
    });
    return jsonResponse({ result: obj });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({
      user_message: `evaluate.${body.mode}`, bot_reply: "",
      channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-evaluate:${body.mode}`, server_name: "ai-evaluate",
      function_error: err,
    });
    return jsonResponse({ error: err }, 500);
  }
});