// =============================================================================
// ai-interview-screen-resume-v2
//
// Phase 3B-2A.1 — crash-safe variant: the background worker reloads the
// resume text from the DB by job_id only and never closes over the HTTP
// request body. The full lifecycle is delegated to the pure orchestrator
// in _shared/resume-screen-runner.ts so it can be tested without burning
// real credits.
//
// Contract:
//   POST { request_id: uuid, resume_text?: string, async_version: 2 }
//   Header: x-candidate-token  (or body.candidate_token)
//
// Response (fast, <2s):
//   200 { ok:true, job_id, status, reused, terminal }
//   400 bad_body | no_resume | no_project | resume_save_failed
//   401 candidate_token_required | bad_token
//   402 no_credits
//   500 internal | runtime_no_background
//
// Background work (EdgeRuntime.waitUntil): runResumeScreenJob(prodDeps, {jobId}).
// Worker reloads candidate.resume_text + resume_hash + resume_updated_at
// from DB, recomputes hash, refuses to call the provider on a version
// mismatch (preserves the old report), runs primary (ProTalk) with retries,
// optional RR Pro Max fallback, strict validation, atomic stage-specific
// save via save_candidate_resume_evaluation_v2 RPC.
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
  createOrReuseAiJob, debitAiJobOnce, finishAttempt as ajFinishAttempt,
  isTerminalStatus, markJobStatusStrict, recordAttemptDiagnostics,
  sha256Hex, startAttempt as ajStartAttempt,
} from "../_shared/ai-jobs.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import { validateResumeScreenReport, type ResumeScreenReport } from "../_shared/ai-validators.ts";
import {
  runResumeScreenJob,
  type ResumeRunnerDeps, type ResumeJob, type ResumeInput,
  type ProviderResult, type JobStatus,
} from "../_shared/resume-screen-runner.ts";

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

// ---------------------------------------------------------------------------
// Production adapters for runResumeScreenJob.
// ---------------------------------------------------------------------------
function buildProdDeps(adminAny: ReturnType<typeof getAdminClient>): ResumeRunnerDeps {
  const admin = adminAny!;
  return {
    jobs: {
      async getJob(jobId): Promise<ResumeJob | null> {
        const { data } = await admin.from("ai_jobs")
          .select("id, candidate_id, status, fallback_allowed, request_snapshot")
          .eq("id", jobId).maybeSingle();
        if (!data) return null;
        const snap = (data as any).request_snapshot || {};
        return {
          id: (data as any).id,
          candidateId: (data as any).candidate_id,
          projectId: String(snap.project_id || ""),
          status: (data as any).status as JobStatus,
          fallbackAllowed: !!(data as any).fallback_allowed,
          snapshot: {
            resume_hash: String(snap.resume_hash || ""),
            resume_updated_at: String(snap.resume_updated_at || ""),
            criteria_hash: String(snap.criteria_hash || ""),
            project_id: String(snap.project_id || ""),
          },
        };
      },
      async markStatus(jobId, status, completed) {
        const r = await markJobStatusStrict(jobId, status, completed);
        return r as { ok: boolean; error?: string };
      },
    },
    inputs: {
      async loadResumeInput(job) {
        const { data: cand } = await admin
          .from("candidates")
          .select("id, project_id, resume_text, resume_updated_at, updated_at")
          .eq("id", job.candidateId).maybeSingle();
        if (!cand) return { ok: false, error: "candidate_not_found" };
        const resumeText = String((cand as any).resume_text || "");
        if (!resumeText || resumeText.length < 50) return { ok: false, error: "resume_text_missing" };
        const { data: proj } = await admin
          .from("projects").select("role_name, vacancy_text")
          .eq("id", job.projectId).maybeSingle();
        if (!proj) return { ok: false, error: "project_not_found" };
        const { data: blk } = await admin
          .from("interview_blocks").select("payload")
          .eq("project_id", job.projectId).eq("kind", "resume").maybeSingle();
        const criteria = String(((blk as any)?.payload?.criteria_md) || "");
        const criteriaHash = await sha256Hex(criteria);
        const resumeHash = await sha256Hex(resumeText);
        return {
          ok: true,
          input: {
            candidateId: job.candidateId, projectId: job.projectId,
            resumeText, resumeHash,
            resumeUpdatedAt: String((cand as any).resume_updated_at || (cand as any).updated_at || ""),
            criteria, criteriaHash,
            roleName: String((proj as any).role_name || ""),
            vacancyText: String((proj as any).vacancy_text || ""),
          },
        };
      },
      async computeResumeHash(text) { return await sha256Hex(text); },
    },
    attempts: {
      async startAttempt(jobId, provider) {
        const r = await ajStartAttempt(jobId, provider, {
          jobStatus: provider === "primary" ? "primary_running" : "fallback_running",
          extraJobPatch: provider === "rr_pro_max" ? { fallback_used: true } : undefined,
        });
        return r?.attemptId ?? null;
      },
      async finishAttempt(attemptId, patch) {
        await ajFinishAttempt(attemptId, { status: patch.status, safe_error_code: patch.safe_error_code ?? null });
      },
      async saveDiagnostics(attemptId, diag) {
        await recordAttemptDiagnostics(attemptId, {
          chatId: diag.chatId ?? null,
          operationPart: diag.operationPart ?? null,
          validationOk: diag.validationOk ?? null,
          durationMs: diag.durationMs ?? null,
          responseMeta: diag.responseMeta ?? null,
        });
      },
    },
    billing: {
      async debitOnce(jobId, candidateId) {
        const r = await debitAiJobOnce(jobId, candidateId, "resume_screen");
        if (!r.ok) return { ok: false, error: r.error };
        const outcome = (r.outcome as any) || {};
        const hasCredits = !(outcome && outcome.ok === false);
        return { ok: true, already: !!r.already, hasCredits };
      },
    },
    provider: {
      fallbackConfigured: () => RrProMaxProvider.isConfigured(),
      async callPrimary({ jobId, candidateId, prompt }): Promise<ProviderResult> {
        const seed = `ai_${jobId}_primary`;
        const startedAt = Date.now();
        try {
          const r = await callProTalkWithRetry({
            message: prompt, chatIdSeed: seed,
            socialId: buildSocialId({ user_id: candidateId }),
            timeoutMs: 120_000, attempts: 3,
            validate: (text) => {
              const obj = tryParseJson<unknown>(text);
              const v = validateResumeScreenReport(obj);
              return v.ok ? { ok: true } : { ok: false, code: v.code };
            },
          });
          return {
            ok: true, reportJson: tryParseJson<unknown>(r.text),
            chatId: `${seed}_a${r.attempts}`, attempts: r.attempts,
            durationMs: Date.now() - startedAt,
          };
        } catch (e) {
          return { ok: false, errorCode: String((e as Error).message || "primary_failed").slice(0, 64), durationMs: Date.now() - startedAt };
        }
      },
      async callFallback({ jobId, candidateId, prompt, attempt }): Promise<ProviderResult> {
        const chat = `ai_${jobId}_fallback_a${attempt}`;
        const social = buildSocialId({ user_id: candidateId });
        const startedAt = Date.now();
        try {
          await RrProMaxProvider.restart(chat, social);
          const r = await RrProMaxProvider.run(prompt, chat, social, 120_000);
          if (!r.ok) return { ok: false, errorCode: r.safeErrorCode, chatId: chat, durationMs: Date.now() - startedAt };
          return { ok: true, reportJson: tryParseJson<unknown>(r.text), chatId: chat, durationMs: Date.now() - startedAt };
        } catch (e) {
          return { ok: false, errorCode: String((e as Error).message || "fallback_failed").slice(0, 64), chatId: chat, durationMs: Date.now() - startedAt };
        }
      },
    },
    results: {
      async saveResumeEvaluation({ candidateId, report }) {
        const r = await admin.rpc("save_candidate_resume_evaluation_v2", {
          _candidate: candidateId,
          _resume_score: report.score,
          _resume_feedback: report.employer as unknown as Record<string, unknown>,
          _candidate_resume_feedback: report.candidate as unknown as Record<string, unknown>,
          _assessment_summary: report.candidate.summary.slice(0, 4000),
        });
        if (r.error) return { ok: false, error: r.error.message };
        return { ok: true };
      },
    },
    validator: { validate: (raw) => validateResumeScreenReport(raw) },
    clock: { now: () => Date.now() },
    buildPrompt: (input) => buildPrompt({
      roleName: input.roleName, vacancyText: input.vacancyText,
      criteria: input.criteria, resumeText: input.resumeText,
    }),
    fallbackAttempts: 2,
  };
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

  // ---- load candidate (for project_id) and resolve resume_text
  const { data: cand } = await admin
    .from("candidates")
    .select("id, project_id, resume_text, resume_hash, resume_updated_at")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand?.project_id) return jsonResponse({ error: "no_project" }, 400);

  // resume_text: prefer caller body, fall back to DB.
  const incoming = String(body.resume_text || "").trim().slice(0, 20000);
  const existing = String((cand as any).resume_text || "").trim();
  const finalText = (incoming && incoming.length >= 50) ? incoming : existing;
  if (!finalText || finalText.length < 50) return jsonResponse({ error: "no_resume" }, 400);

  // Atomic save of resume_text + resume_hash + resume_updated_at via
  // server-only RPC, so the version timestamp and the content fingerprint
  // can never drift apart. Only touches resume fields.
  let resumeHash: string;
  let resumeUpdatedAt: string;
  if (finalText !== existing || !(cand as any).resume_hash) {
    const saved = await admin.rpc("save_candidate_resume_text", {
      _candidate: candidateId, _resume_text: finalText,
    });
    if (saved.error) return jsonResponse({ error: "resume_save_failed", detail: saved.error.message.slice(0, 80) }, 500);
    const row = saved.data as { resume_hash: string; resume_updated_at: string };
    resumeHash = row.resume_hash;
    resumeUpdatedAt = row.resume_updated_at;
  } else {
    resumeHash = String((cand as any).resume_hash || (await sha256Hex(finalText)));
    resumeUpdatedAt = String((cand as any).resume_updated_at || "");
  }

  // Compute criteria hash from current interview_blocks (full sha256).
  const { data: blk } = await admin
    .from("interview_blocks").select("payload")
    .eq("project_id", cand.project_id).eq("kind", "resume").maybeSingle();
  const criteriaHash = await sha256Hex(String(((blk as any)?.payload?.criteria_md) || ""));

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
      resume_updated_at: resumeUpdatedAt,
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

  // ---- background lifecycle is the pure orchestrator (DI). It performs
  // its OWN debit so we never charge twice on a duplicate request. The
  // worker receives ONLY the job_id — it reloads everything from the DB.
  const jobId = created.id;
  const prodDeps = buildProdDeps(admin);
  runInBackground((async () => {
    try {
      const outcome = await runResumeScreenJob(prodDeps, { jobId });
      if (outcome.kind === "save_failed") {
        try { await logToDb({
          user_message: "[v2 resume save failed]",
          bot_reply: outcome.code,
          channel_id: `job_${jobId}`,
          user_social_id: candidateId,
          channel_name: "ai-interview:screen-resume-v2",
          server_name: "ai-interview-screen-resume-v2",
          function_error: outcome.code,
        }); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("[screen-resume-v2] background crashed", (e as Error)?.message);
      await markJobStatusStrict(jobId, "primary_failed", true);
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
