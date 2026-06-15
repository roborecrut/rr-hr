// Score a candidate's free-form text answer against the expected reference via ProTalk.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { question_id: string; answer: string; candidate_token?: string };
  if (!body?.question_id || typeof body.answer !== "string") return jsonResponse({ error: "bad_body" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: q, error: qe } = await admin.from("training_questions").select("*").eq("id", body.question_id).maybeSingle();
  if (qe || !q) return jsonResponse({ error: "no_question" }, 404);
  if (q.kind !== "text") return jsonResponse({ error: "not_text_question" }, 400);

  const chatId = buildChatId({ userId: candidateId });
  const socialId = buildSocialId({ user_id: candidateId });
  const maxPts = Number(q.points) || 5;
  const msg = `Оцени ответ кандидата от 0 до ${maxPts}. Верни СТРОГО JSON без markdown: {"score": number, "feedback": string}.\n\nВОПРОС: ${q.question}\nЭТАЛОН: ${q.expected_answer || ""}\nОТВЕТ КАНДИДАТА: ${String(body.answer).slice(0, 4000)}`;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — строгий экзаменатор. Оцениваешь по смыслу, не по форме." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 90_000,
    });
    const parsed = tryParseJson<{ score: number; feedback: string }>(r.text) || { score: 0, feedback: r.text };
    const score = Math.max(0, Math.min(maxPts, Math.round(Number(parsed.score) || 0)));
    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId, channel_name: "ai-check-text-answer", server_name: "ai-check-text-answer", function_call_params: JSON.stringify({ question_id: body.question_id }) });
    return jsonResponse({ ok: true, score, max: maxPts, feedback: parsed.feedback || "" });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-check-text-answer", server_name: "ai-check-text-answer", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});