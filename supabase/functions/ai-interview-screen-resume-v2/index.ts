// =============================================================================
// ai-interview-screen-resume-v2
//
// Phase 3B-2A — first vertical slice of the new async AI-job architecture.
//
// Contract:
//   POST { request_id: uuid, resume_text?: string, async_version: 2 }
//   Header: x-candidate-token  (or body.candidate_token)
//
// Response (fast, <2s):
//   200 { ok:true, job_id, status, reused, terminal }
//   400 bad_body | no_resume
//   401 candidate_token_required | bad_token
//   402 no_credits
//   500 internal | runtime_no_background
//
// Background work (EdgeRuntime.waitUntil): primary ProTalk (3 retries),
// optional RR Pro Max fallback (2 retries), strict validation, atomic
// stage-specific save via save_candidate_resume_evaluation_v2 RPC.
//
// Live rollback: the original synchronous ai-interview-screen-resume function
// is left UNTOUCHED and still serves the existing frontend until polling is
// fully wired. New frontend explicitly calls -v2.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildChatId, buildSocialId, callProTalkWithRetry, tryParseJson,
  getAdminClient, logToDb,
} from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import {
  createOrReuseAiJob, debitAiJobOnce, finishAttempt, isTerminalStatus,
  markJobStatus, markJobStatusStrict, markSaveFailed, markValidationFailed,
  recordAttemptDiagnostics, sha256Hex, startFallbackAttempt, startPrimaryAttempt,
} from "../_shared/ai-jobs.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import { validateResumeScreenReport, type ResumeScreenReport } from "../_shared/ai-validators.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildPrompt(opts: {
  roleName: string;
  vacancyText: string;
  criteria: string;
  resumeText: string;
}): string {
  return `Ты — старший HR-эксперт. Проведи структурированный анализ резюме кандидата строго по критериям работодателя.

ВАЖНЫЕ ПРАВИЛА:
1. НИКОГДА не используй и не цитируй в отчёте сведения о возрасте, поле, расе, национальности, религии, политических взглядах, семейном положении, беременности, состоянии здоровья, инвалидности, внешности. Эти признаки НЕ влияют на оценку.
2. Если по требованию данных нет в резюме — degree="не подтверждено", это пробел, а НЕ красный флаг.
3. Каждый risk и red_flag обязан содержать конкретное evidence — точную цитату или формулировку «отсутствует подтверждение требования X».
4. Не делай кадровое решение «нанимать/не нанимать» — формируй экспертное мнение для финального решения работодателя.
5. Отчёт кандидата — отдельный, мягкий, уважительный, без employer_wishes и внутренних рисков.

ВАКАНСИЯ: ${opts.roleName}
ОПИСАНИЕ ВАКАНСИИ:
${opts.vacancyText || "(не указано)"}

КРИТЕРИИ ОТ РАБОТОДАТЕЛЯ:
${opts.criteria || "(критерии не заданы — оцени по соответствию должности)"}

РЕЗЮМЕ КАНДИДАТА:
${opts.resumeText.slice(0, 10000)}

Верни СТРОГО валидный JSON без markdown:
{
  "score": <integer 0..100>,
  "employer": {
    "verdict": "<высокое соответствие | частичное соответствие | низкое соответствие | недостаточно данных>",
    "summary": "<6-10 предложений эксперту-работодателю>",
    "matches": [{"criterion":"...","degree":"<полностью|частично|не подтверждено>","evidence":"<цитата/факт>"}],
    "gaps": [{"criterion":"...","finding":"...","impact":"..."}],
    "strengths": ["..."],
    "risks": [{"title":"...","evidence":"...","severity":"<низкий|средний|высокий>","how_to_verify":"..."}],
    "red_flags": [{"title":"...","evidence":"...","severity":"<средний|высокий>"}],
    "questions_to_verify": ["..."]
  },
  "candidate": {
    "summary": "<мягкий итог для кандидата, 3-5 предложений>",
    "strengths": ["..."],
    "areas_to_clarify": ["..."],
    "recommendations": ["..."]
  }
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  // ---- parse body
  const body = await req.json().catch(() => null) as null | {
    request_id?: string;
    candidate_token?: string;
    resume_text?: string;
    async_version?: number;
  };
  if (!body) return jsonResponse({ error: "bad_body" }, 400);
  const requestId = String(body.request_id || "").trim();
  if (!UUID_RE.test(requestId)) return jsonResponse({ error: "bad_request_id" }, 400);
  if (body.async_version !== 2) return jsonResponse({ error: "bad_async_version" }, 400);

  // ---- auth: candidate token only (server-side derives candidate_id)
  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  // ---- runtime capability check (no debit if we can't run in background)
  const er = (globalThis as any).EdgeRuntime;
  if (!er || typeof er.waitUntil !== "function") {
    return jsonResponse({ error: "runtime_no_background" }, 500);
  }

  // ---- load candidate + project; persist resume_text BEFORE creating job
  const { data: cand } = await admin
    .from("candidates")
    .select("id, project_id, resume_text")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand?.project_id) return jsonResponse({ error: "no_project" }, 400);

  // resume_text: prefer caller body, fall back to DB. Always persist a clean
  // copy in candidates. Never store it in ai_jobs.request_snapshot.
  let resumeText = String(body.resume_text || cand.resume_text || "").trim();
  if (!resumeText || resumeText.length < 50) {
    return jsonResponse({ error: "no_resume" }, 400);
  }
  resumeText = resumeText.slice(0, 20000);
  if (resumeText !== (cand.resume_text || "")) {
    await admin.from("candidates").update({ resume_text: resumeText }).eq("id", candidateId);
  }
  const resumeHash = (await sha256Hex(resumeText)).slice(0, 32);

  const { data: proj } = await admin
    .from("projects")
    .select("role_name, vacancy_text")
    .eq("id", cand.project_id)
    .maybeSingle();
  const { data: blk } = await admin
    .from("interview_blocks")
    .select("payload")
    .eq("project_id", cand.project_id)
    .eq("kind", "resume")
    .maybeSingle();
  const criteria = ((blk as any)?.payload?.criteria_md || "").toString();
  const criteriaHash = (await sha256Hex(criteria)).slice(0, 16);

  // ---- idempotent job creation
  const idem = `screen_resume_v2:${candidateId}:${requestId}`;
  const created = await createOrReuseAiJob({
    userId: null,
    candidateId,
    jobType: "screen_resume_v2",
    idempotencyKey: idem,
    requestSnapshot: {
      candidate_id: candidateId,
      project_id: cand.project_id,
      resume_hash: resumeHash,
      criteria_hash: criteriaHash,
      requested_at: new Date().toISOString(),
    },
    fallbackAllowed: true,
  });
  if ("error" in created) return jsonResponse({ error: "job_create_failed", detail: created.error }, 500);

  // Reused job: never re-charge, never re-run. Just report current status.
  if (created.reused) {
    return jsonResponse({
      ok: true,
      job_id: created.id,
      status: created.status,
      reused: true,
      terminal: isTerminalStatus(created.status),
    });
  }

  // ---- one-time RR debit for this NEW job. Idempotent at the spend_pack
  // level (key pack:interview:{candidate}) — second AI stage for the same
  // candidate returns already=true and does NOT consume another credit.
  const debit = await debitAiJobOnce(created.id, candidateId, "resume_screen");
  if (!debit.ok) {
    await markJobStatus(created.id, "cancelled", true);
    return jsonResponse({ error: "billing_failed", detail: debit.error }, 402);
  }
  const outcome = (debit.outcome as any) || {};
  if (outcome && outcome.ok === false) {
    await markJobStatus(created.id, "cancelled", true);
    return jsonResponse({ error: "no_credits" }, 402);
  }

  // ---- background lifecycle: primary → fallback → validate → atomic save
  const projectId = cand.project_id as string;
  const roleName = String((proj as any)?.role_name || "");
  const vacancyText = String((proj as any)?.vacancy_text || "");
  const jobId = created.id;

  const work = async () => {
    const prompt = buildPrompt({ roleName, vacancyText, criteria, resumeText });
    let report: ResumeScreenReport | null = null;
    let primaryDone = false;

    // ---- PRIMARY (ProTalk) up to 3 attempts via callProTalkWithRetry
    const primaryAttemptId = await startPrimaryAttempt(jobId);
    if (!primaryAttemptId) {
      await markJobStatus(jobId, "primary_failed", true);
      return;
    }
    const startedAt = Date.now();
    try {
      const seed = `ai_${jobId}_primary`;
      const r = await callProTalkWithRetry({
        message: prompt,
        chatIdSeed: seed,
        socialId: buildSocialId({ user_id: candidateId }),
        timeoutMs: 120_000,
        attempts: 3,
        validate: (text) => {
          const obj = tryParseJson<unknown>(text);
          const v = validateResumeScreenReport(obj);
          return v.ok ? { ok: true } : { ok: false, code: v.code };
        },
      });
      const obj = tryParseJson<unknown>(r.text);
      const v = validateResumeScreenReport(obj);
      if (v.ok) { report = v.value; primaryDone = true; }
      await recordAttemptDiagnostics(primaryAttemptId, {
        chatId: `${seed}_a${r.attempts}`,
        operationPart: "resume_screen",
        validationOk: v.ok,
        durationMs: Date.now() - startedAt,
        responseMeta: { attempts: r.attempts, provider: "primary", schema_code: v.ok ? null : v.code },
      });
      await finishAttempt(primaryAttemptId, { status: "succeeded" });
    } catch (e) {
      const safe = String((e as Error).message || "primary_failed").slice(0, 64);
      await recordAttemptDiagnostics(primaryAttemptId, {
        operationPart: "resume_screen",
        validationOk: false,
        durationMs: Date.now() - startedAt,
        responseMeta: { provider: "primary", error_code: safe.slice(0, 32) },
      });
      await finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: safe });
    }

    // ---- FALLBACK (RR Pro Max) only if primary failed AND configured
    if (!report) {
      await markJobStatus(jobId, "primary_failed");
      if (!RrProMaxProvider.isConfigured()) {
        await markJobStatus(jobId, "fallback_unavailable" as any, true).catch(async () => {
          // Some deployments may not have this enum value; degrade safely.
          await markJobStatus(jobId, "fallback_failed", true);
        });
        return;
      }
      await markJobStatus(jobId, "fallback_available");
      const maxFb = 2;
      for (let attempt = 1; attempt <= maxFb && !report; attempt++) {
        const fbId = await startFallbackAttempt(jobId);
        if (!fbId) break;
        const fbChat = `ai_${jobId}_fallback_a${attempt}`;
        const fbSocial = buildSocialId({ user_id: candidateId });
        const fbStart = Date.now();
        try {
          await RrProMaxProvider.restart(fbChat, fbSocial);
          const r = await RrProMaxProvider.run(prompt, fbChat, fbSocial, 120_000);
          if (!r.ok) throw new Error(r.safeErrorCode);
          const obj = tryParseJson<unknown>(r.text);
          const v = validateResumeScreenReport(obj);
          if (v.ok) { report = v.value; }
          await recordAttemptDiagnostics(fbId, {
            chatId: fbChat,
            operationPart: "resume_screen",
            validationOk: v.ok,
            durationMs: Date.now() - fbStart,
            responseMeta: { provider: "rr_pro_max", attempt, schema_code: v.ok ? null : v.code },
          });
          await finishAttempt(fbId, { status: v.ok ? "succeeded" : "failed", safe_error_code: v.ok ? null : `schema_invalid:${v.code}`.slice(0, 64) });
        } catch (e) {
          const safe = String((e as Error).message || "fallback_failed").slice(0, 64);
          await recordAttemptDiagnostics(fbId, {
            chatId: fbChat,
            operationPart: "resume_screen",
            validationOk: false,
            durationMs: Date.now() - fbStart,
            responseMeta: { provider: "rr_pro_max", attempt, error_code: safe.slice(0, 32) },
          });
          await finishAttempt(fbId, { status: "failed", safe_error_code: safe });
        }
      }
    }

    if (!report) {
      // No usable result. Distinguish save_failed vs validation_failed vs generic.
      await markJobStatus(jobId, primaryDone ? "save_failed" : "fallback_failed", true);
      return;
    }

    // ---- ATOMIC stage-specific save (does not touch checklist/situations/etc.)
    const saveRes = await admin.rpc("save_candidate_resume_evaluation_v2", {
      _candidate: candidateId,
      _resume_score: report.score,
      _resume_feedback: report.employer as unknown as Record<string, unknown>,
      _candidate_resume_feedback: report.candidate as unknown as Record<string, unknown>,
      _assessment_summary: report.candidate.summary.slice(0, 4000),
    });
    if (saveRes.error) {
      await markSaveFailed(jobId, `save:${saveRes.error.message}`.slice(0, 64));
      try {
        await logToDb({
          user_message: "[v2 resume save failed]",
          bot_reply: saveRes.error.message.slice(0, 400),
          channel_id: `job_${jobId}`,
          user_social_id: candidateId,
          channel_name: "ai-interview:screen-resume-v2",
          server_name: "ai-interview-screen-resume-v2",
          function_error: saveRes.error.message.slice(0, 400),
        });
      } catch { /* ignore */ }
      return;
    }

    const finalStatus = primaryDone ? "primary_succeeded" : "fallback_succeeded";
    const ok = await markJobStatusStrict(jobId, finalStatus, true);
    if (!ok.ok) {
      // Save succeeded but status update failed. Mark save_failed for safety
      // — client polling will surface a clear failure and the saved row is
      // discoverable; old result remains intact.
      await markSaveFailed(jobId, `status:${ok.error}`.slice(0, 64));
    }
  };

  runInBackground((async () => {
    try { await work(); }
    catch (e) {
      console.error("[screen-resume-v2] background work crashed", (e as Error)?.message);
      await markJobStatus(jobId, "primary_failed", true);
    }
  })());

  return jsonResponse({
    ok: true,
    job_id: jobId,
    status: "primary_running",
    reused: false,
    terminal: false,
  });
});
