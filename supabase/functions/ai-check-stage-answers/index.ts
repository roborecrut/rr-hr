// Score candidate answers for a stage test. Choice questions are scored locally.
// Text questions are scored by ProTalk with the expected_answer in the prompt.
// Updates candidate_stage_progress (attempts++, best_score, passed_at).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb, resolveCandidatePublicId } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { isContentlessAnswer, isTooShortForOpenEnded, CONTENTLESS_COMMENT } from "../_shared/answer-quality.ts";

type Answer = { question_id: string; value: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    candidate_id?: string; project_id: string; stage: string; answers: Answer[]; candidate_token?: string;
  };
  if (!body?.project_id || !body?.stage || !Array.isArray(body?.answers)) {
    return jsonResponse({ error: "bad_body" }, 400);
  }

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: test } = await admin.from("training_stage_tests")
    .select("questions,pass_score,total_score").eq("project_id", body.project_id).eq("stage", body.stage).maybeSingle();
  if (!test) return jsonResponse({ error: "no_test" }, 404);

  const questions = (test.questions as any[]) || [];
  const passScore = test.pass_score || 70;

  const candPid = await resolveCandidatePublicId(candidateId);
  const chatId = buildChatId({ candidatePublicId: candPid, candidateId });
  const socialId = buildSocialId({ candidate_public_id: candPid, candidate_id: candidateId });

  let total = 0;
  const perQuestion: any[] = [];

  for (const q of questions) {
    const ans = body.answers.find(a => a.question_id === q.id);
    const value = (ans?.value || "").toString().trim();
    if (q.kind === "choice") {
      if (!value) {
        perQuestion.push({ id: q.id, score: 0, max: q.points, comment: "Нет ответа" });
        continue;
      }
      const correct = String(q.correct || "").trim().toLowerCase();
      const ok = value.toLowerCase() === correct;
      const s = ok ? (q.points || 5) : 0;
      total += s;
      perQuestion.push({ id: q.id, score: s, max: q.points, comment: ok ? "Верно" : "Неверно" });
    } else {
      // Pre-filter empty / contentless / too-short answers BEFORE calling LLM
      // — saves provider latency + quota. Conservative on minimum length so
      // short-but-valid answers still reach the model.
      if (isContentlessAnswer(value) || isTooShortForOpenEnded(value)) {
        perQuestion.push({ id: q.id, score: 0, max: q.points, comment: CONTENTLESS_COMMENT });
        continue;
      }
      // Ask ProTalk to grade against expected_answer
      const prompt = `Оцени ответ кандидата по строгому эталону.
ВОПРОС: ${q.question}
ЭТАЛОННЫЙ ОТВЕТ: ${q.expected_answer || ""}
ОТВЕТ КАНДИДАТА: ${value}

Дай оценку от 0 до ${q.points || 5} баллов по смысловому совпадению с эталоном (0 — нет совпадения, ${q.points || 5} — полное соответствие). Верни СТРОГО JSON: {"score":N,"comment":"короткий комментарий до 200 символов"}.`;
      try {
        const r = await callProTalk({
          messages: [{ role: "system", content: "Ты — строгий, но справедливый экзаменатор." }, { role: "user", content: prompt }],
          chatId, socialId, timeoutMs: 90_000,
        });
        const parsed = tryParseJson<{ score: number; comment: string }>(r.text);
        const s = Math.max(0, Math.min(q.points || 5, Math.round(Number(parsed?.score || 0))));
        total += s;
        perQuestion.push({ id: q.id, score: s, max: q.points, comment: parsed?.comment || "" });
      } catch (e) {
        perQuestion.push({ id: q.id, score: 0, max: q.points, comment: "Ошибка проверки: " + String((e as Error).message) });
      }
    }
  }

  const passed = total >= passScore;

  // Upsert progress (attempts++, best_score)
  const { data: existing } = await admin.from("candidate_stage_progress")
    .select("attempts,best_score,passed_at").eq("candidate_id", candidateId).eq("stage", body.stage).maybeSingle();
  const attempts = (existing?.attempts || 0) + 1;
  const bestScore = Math.max(existing?.best_score || 0, total);
  const passedAt = existing?.passed_at || (passed ? new Date().toISOString() : null);

  if (existing) {
    await admin.from("candidate_stage_progress").update({
      attempts, best_score: bestScore, last_score: total,
      last_answers: body.answers, last_feedback: perQuestion, passed_at: passedAt,
    }).eq("candidate_id", candidateId).eq("stage", body.stage);
  } else {
    await admin.from("candidate_stage_progress").insert({
      candidate_id: candidateId, stage: body.stage,
      attempts, best_score: bestScore, last_score: total,
      last_answers: body.answers, last_feedback: perQuestion, passed_at: passedAt,
    });
  }

  await logToDb({ user_message: `check stage ${body.stage}`, bot_reply: `score ${total}/${test.total_score} passed=${passed}`,
    channel_id: chatId, user_social_id: socialId, channel_name: `ai-check-stage:${body.stage}`,
    server_name: "ai-check-stage-answers",
    function_call_params: JSON.stringify({ candidate_id: candidateId, project_id: body.project_id, stage: body.stage }) });

  // Лимиты RR §2: списываем один лимит обучения с вакансии (projects.training_used)
  // при первой успешной проверке ЛЮБОГО этапа обучения. charge_project_limit
  // идемпотентна per candidate — повторные сдачи и другие этапы не спишут ещё раз.
  try {
    await admin.rpc("charge_project_limit", { _candidate: candidateId, _kind: "training" });
  } catch (_) { /* лимит исчерпан — клиент решит, как реагировать */ }

  return jsonResponse({ ok: true, score: total, total_score: test.total_score, pass_score: passScore, passed, attempts, per_question: perQuestion });
});