// Prod deps for runResumeScreenJob shared between the candidate-facing
// edge function and the watchdog.
import {
  buildChatId, buildSocialId, callProTalkWithRetry, tryParseJson,
  resolveCandidatePublicId, getAdminClient,
} from "./protalk.ts";
import {
  debitAiJobOnce, finishAttempt as ajFinishAttempt, markJobStatusStrict,
  recordAttemptDiagnostics, sha256Hex, startAttempt as ajStartAttempt,
} from "./ai-jobs.ts";
import { RrProMaxProvider } from "./rr-pro-max.ts";
import { validateResumeScreenReport } from "./ai-validators.ts";
import type {
  ResumeRunnerDeps, ResumeJob, ProviderResult, JobStatus,
} from "./resume-screen-runner.ts";

function buildPrompt(opts: { roleName: string; vacancyText: string; criteria: string; resumeText: string }): string {
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

export function buildResumeScreenProdDeps(adminAny: ReturnType<typeof getAdminClient>): ResumeRunnerDeps {
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
        const startedAt = Date.now();
        const candPid = await resolveCandidatePublicId(candidateId);
        const chat = buildChatId({ candidatePublicId: candPid, candidateId });
        try {
          const r = await callProTalkWithRetry({
            message: prompt, chatId: chat,
            socialId: buildSocialId({ candidate_public_id: candPid, candidate_id: candidateId }),
            timeoutMs: 180_000, attempts: 3,
            validate: (text) => {
              const obj = tryParseJson<unknown>(text);
              const v = validateResumeScreenReport(obj);
              return v.ok ? { ok: true } : { ok: false, code: v.code };
            },
          });
          return {
            ok: true, reportJson: tryParseJson<unknown>(r.text),
            chatId: chat, attempts: r.attempts,
            durationMs: Date.now() - startedAt,
          };
        } catch (e) {
          return { ok: false, errorCode: String((e as Error).message || "primary_failed").slice(0, 64), durationMs: Date.now() - startedAt };
        }
      },
      async callFallback({ jobId, candidateId, prompt, attempt }): Promise<ProviderResult> {
        const candPid = await resolveCandidatePublicId(candidateId);
        const chat = buildChatId({ candidatePublicId: candPid, candidateId });
        const social = buildSocialId({ candidate_public_id: candPid, candidate_id: candidateId });
        const startedAt = Date.now();
        try {
          await RrProMaxProvider.restart(chat, social);
          const r = await RrProMaxProvider.run(prompt, chat, social, 180_000);
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
        try { await admin.rpc("charge_project_limit", { _candidate: candidateId, _kind: "interview" }); } catch (_) { /* ignore */ }
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