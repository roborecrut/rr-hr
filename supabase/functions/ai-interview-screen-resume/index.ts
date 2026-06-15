// Score candidate resume against vacancy criteria. Returns {score, summary, strengths[], gaps[]}.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { createOrReuseAiJob, startPrimaryAttempt, finishAttempt, markJobStatus } from "../_shared/ai-jobs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; candidate_id?: string; resume_text: string; candidate_token?: string };
  if (!body?.project_id || !body?.resume_text) return jsonResponse({ error: "bad_body" }, 400);

  // 1. Пользовательские/авторизационные ошибки — БЕЗ резерва.
  //    Резерв включаем только когда основная нейросеть подтверждённо сломалась.
  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  // Billing: charge employer once per (candidate, interview) — idempotent via spend_pack.
  // Only billed candidates can submit a resume for AI grading. Re-attempts are free
  // (spend_pack uses idem_key `pack:interview:{candidate_id}`).
  try {
    const billed = await admin.rpc("spend_pack", { _candidate: candidateId, _kind: "interview" });
    const ok = (billed as any)?.data?.ok;
    if (!ok && !(billed as any)?.data?.already) {
      return jsonResponse({ error: "no_credits", reason: (billed as any)?.error?.message || "insufficient_funds" }, 402);
    }
  } catch (e) {
    return jsonResponse({ error: "billing_failed", detail: String((e as Error).message) }, 402);
  }

  const [{ data: proj }, { data: blk }] = await Promise.all([
    admin.from("projects").select("role_name,vacancy_text").eq("id", body.project_id).maybeSingle(),
    admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","resume").maybeSingle(),
  ]);
  const criteria = ((blk as any)?.payload?.criteria_md || "").toString();

  const chatId = buildChatId({ userId: candidateId });
  const socialId = buildSocialId({ user_id: candidateId });

  const msg = `Ты HR-эксперт. Оцени резюме кандидата по вакансии "${(proj as any)?.role_name || ""}".
Критерии:
${criteria || "(нет критериев — оцени по соответствию должности)"}

Описание вакансии:
${(proj as any)?.vacancy_text || ""}

РЕЗЮМЕ КАНДИДАТА:
${body.resume_text.slice(0, 10000)}

Верни СТРОГО JSON: {"score":0..100,"summary":string (2-4 предложения для кандидата),"strengths":string[],"gaps":string[]}`;

  // 2. Регистрируем ai_jobs ДО вызова ProTalk — чтобы при техническом сбое
  //    клиент получил job_id и кнопку «Запустить RR Pro Max».
  //    Снимок не содержит секретов: только промт, id кандидата/проекта и
  //    сам текст резюме (уже хранится в БД после успеха).
  const idem = `screen_resume:${candidateId}`;
  const job = await createOrReuseAiJob({
    userId: null,
    candidateId,
    jobType: "screen_resume",
    idempotencyKey: idem,
    requestSnapshot: { message: msg, candidate_id: candidateId, project_id: body.project_id, resume_text: body.resume_text.slice(0, 20000), timeout_ms: 120_000 },
    fallbackAllowed: true,
  });
  const jobId = "id" in job ? job.id : null;
  const attemptId = jobId ? await startPrimaryAttempt(jobId) : null;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 120_000 });
    const obj = tryParseJson<any>(r.text) || {};
    if (typeof obj !== "object" || obj === null || obj.score === undefined) {
      throw new Error("bad_json");
    }
    const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
    const result = {
      score,
      summary: String(obj.summary || "").slice(0, 1500),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
    };

    // Upsert candidate_scores (PK = candidate_id, no separate `id` column)
    await admin.from("candidate_scores").upsert({
      candidate_id: candidateId,
      resume_score: score,
      assessment_summary: result.summary,
      resume_feedback: result,
    }, { onConflict: "candidate_id" });
    await admin.from("candidates").update({ resume_text: body.resume_text.slice(0, 20000) }).eq("id", candidateId);

    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: r.text.slice(0, 5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:screen-resume", server_name: "ai-interview-screen-resume" });
    if (attemptId) await finishAttempt(attemptId, { status: "succeeded", result_reference: `candidate_scores:${candidateId}:resume` });
    if (jobId) await markJobStatus(jobId, "primary_succeeded", true);
    return jsonResponse({ ok: true, result });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:screen-resume", server_name: "ai-interview-screen-resume", function_error: err });
    if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: err.slice(0, 64) });
    if (jobId) {
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");
    }
    // Резерв допустим — техническая ошибка основной нейросети.
    return jsonResponse({ error: err, job_id: jobId, fallback_available: !!jobId }, 500);
  }
});