// Prod deps for runSituationsGradeJob, shared between
// ai-interview-grade-situations-v2 and ai-job-watchdog.
import {
  buildChatId, buildSocialId, callProTalkWithRetry, tryParseJson,
  resolveCandidatePublicId, getAdminClient,
} from "./protalk.ts";
import {
  canonicalJsonStringify, debitAiJobOnce, finishAttempt as ajFinishAttempt,
  markJobStatusStrict, recordAttemptDiagnostics, sha256Hex,
  startAttempt as ajStartAttempt,
} from "./ai-jobs.ts";
import { RrProMaxProvider } from "./rr-pro-max.ts";
import { validateSituationsGradeReport } from "./ai-validators.ts";
import type {
  SituationsRunnerDeps, SituationsJob, SituationsInput, ProviderResult,
  JobStatus, SituationItem,
} from "./situations-grade-runner.ts";

function buildPrompt(input: SituationsInput): string {
  const safeS = input.situations.map((s) => ({
    id: s.id, title: s.title, brief: s.brief,
    criteria: s.criteria || null,
    answer: (input.answers[s.id] || "").toString().slice(0, 4000),
  }));
  return `Ты — старший HR-эксперт по поведенческой оценке. Оцени развёрнутые ответы кандидата на 3 ролевые ситуации.

ВАЖНЫЕ ПРАВИЛА:
1. НИКОГДА не используй сведения о возрасте, поле, расе, национальности, религии, политических взглядах, семейном положении, беременности, здоровье, инвалидности, внешности.
2. Каждый risk и red_flag обязан содержать конкретное evidence (точная цитата или формулировка «ответ обтекаемый по критерию X»).
3. Не делай кадровое решение «нанимать/не нанимать» — формируй экспертное мнение для финального решения работодателя.
4. В candidate-разделе запрещено упоминать internal criteria, employer wishes, risks, red_flags, demonstrated_competencies, weak_competencies. Не цитируй внутренние эталоны.
5. Тон candidate-раздела — уважительный, мягкий, профессиональный, без унижения.
6. Каждая ситуация обязана попасть и в employer.items, и в candidate.items (по одному элементу).

ВАКАНСИЯ: ${input.roleName}
ОПИСАНИЕ ВАКАНСИИ:
${(input.vacancyText || "(не указано)").slice(0, 4000)}

ПОЖЕЛАНИЯ РАБОТОДАТЕЛЯ:
${(input.employerWishes || "(не заданы)").slice(0, 2000)}

СИТУАЦИИ И ОТВЕТЫ КАНДИДАТА:
${JSON.stringify(safeS)}

Верни СТРОГО валидный JSON без markdown:
{
  "total": <integer 0..100>,
  "employer": {
    "summary": "<6-10 предложений эксперту-работодателю>",
    "demonstrated_competencies": ["..."],
    "weak_competencies": ["..."],
    "risks": [{"title":"...","evidence":"...","severity":"<низкий|средний|высокий>","how_to_verify":"..."}],
    "red_flags": [{"title":"...","evidence":"...","severity":"<средний|высокий>"}],
    "items": [{"situation_id":"sN","score":0..100,"employer_feedback":"...","evidence":"..."}]
  },
  "candidate": {
    "summary": "<мягкий итог для кандидата>",
    "strengths": ["..."],
    "areas_to_improve": ["..."],
    "items": [{"situation_id":"sN","score":0..100,"feedback":"...","recommendation":"..."}]
  }
}`;
}

export async function answersHash(answers: Record<string, string>): Promise<string> {
  const normalized: Record<string, string> = {};
  for (const k of Object.keys(answers).sort()) {
    normalized[k] = String(answers[k] ?? "").trim();
  }
  return await sha256Hex(canonicalJsonStringify(normalized));
}
export async function situationsHash(items: SituationItem[]): Promise<string> {
  const norm = items.map((s) => ({
    id: s.id, title: s.title, brief: s.brief, criteria: s.criteria || null,
  }));
  return await sha256Hex(canonicalJsonStringify(norm));
}
export function normalizeSituation(raw: any): SituationItem {
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    brief: String(raw?.brief || ""),
    criteria: raw?.criteria ? String(raw.criteria) : undefined,
  };
}

export function buildSituationsProdDeps(adminAny: ReturnType<typeof getAdminClient>): SituationsRunnerDeps {
  const admin = adminAny!;
  return {
    jobs: {
      async getJob(jobId): Promise<SituationsJob | null> {
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
            answers_hash: String(snap.answers_hash || ""),
            answers_updated_at: String(snap.answers_updated_at || ""),
            situations_hash: String(snap.situations_hash || ""),
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
      async loadInput(job) {
        const { data: cand } = await admin
          .from("candidates").select("id, project_id")
          .eq("id", job.candidateId).maybeSingle();
        if (!cand) return { ok: false, error: "candidate_not_found" };
        const { data: proj } = await admin
          .from("projects").select("role_name, vacancy_text")
          .eq("id", job.projectId).maybeSingle();
        if (!proj) return { ok: false, error: "project_not_found" };
        const { data: blk } = await admin
          .from("interview_blocks").select("payload")
          .eq("project_id", job.projectId).eq("kind", "situations").maybeSingle();
        const rawSs: any[] = (blk as any)?.payload?.situations || [];
        if (!rawSs.length) return { ok: false, error: "situations_missing" };
        const employerWishes = String(((blk as any)?.payload?.employer_wishes) || "");
        const situations = rawSs.map(normalizeSituation);
        const { data: ansRow } = await admin
          .from("candidate_situations_answers_v2")
          .select("answers, answers_hash, updated_at")
          .eq("candidate_id", job.candidateId)
          .eq("project_id", job.projectId)
          .maybeSingle();
        if (!ansRow) return { ok: false, error: "answers_missing" };
        const answers = (ansRow as any).answers as Record<string, string> || {};
        return {
          ok: true,
          input: {
            candidateId: job.candidateId, projectId: job.projectId,
            roleName: String((proj as any).role_name || ""),
            vacancyText: String((proj as any).vacancy_text || ""),
            situations,
            situationsHash: await situationsHash(situations),
            answers,
            answersHash: String((ansRow as any).answers_hash || (await answersHash(answers))),
            answersUpdatedAt: String((ansRow as any).updated_at || ""),
            employerWishes,
          },
        };
      },
      async computeAnswersHash(a) { return await answersHash(a); },
      async computeSituationsHash(s) { return await situationsHash(s); },
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
        const r = await debitAiJobOnce(jobId, candidateId, "situations_grade");
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
            timeoutMs: 150_000, attempts: 3,
            validate: (text) => {
              const obj = tryParseJson<unknown>(text);
              if (!obj || typeof obj !== "object") return { ok: false, code: "not_object" };
              if (!(obj as any).employer || !(obj as any).candidate) return { ok: false, code: "missing_blocks" };
              return { ok: true };
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
          const r = await RrProMaxProvider.run(prompt, chat, social, 150_000);
          if (!r.ok) return { ok: false, errorCode: r.safeErrorCode, chatId: chat, durationMs: Date.now() - startedAt };
          return { ok: true, reportJson: tryParseJson<unknown>(r.text), chatId: chat, durationMs: Date.now() - startedAt };
        } catch (e) {
          return { ok: false, errorCode: String((e as Error).message || "fallback_failed").slice(0, 64), chatId: chat, durationMs: Date.now() - startedAt };
        }
      },
    },
    results: {
      async saveSituationsEvaluation({ candidateId, report }) {
        const r = await admin.rpc("save_candidate_situations_evaluation_v2", {
          _candidate: candidateId,
          _situations_score: report.total,
          _situations_feedback: report.employer as unknown as Record<string, unknown>,
          _candidate_situations_feedback: report.candidate as unknown as Record<string, unknown>,
        });
        if (r.error) return { ok: false, error: r.error.message };
        return { ok: true };
      },
    },
    validator: {
      validate: (raw, input) => {
        return validateSituationsGradeReport(raw, {
          allowedSituationIds: input.situations.map((s) => s.id),
        });
      },
    },
    clock: { now: () => Date.now() },
    buildPrompt: (input) => buildPrompt(input),
    fallbackAttempts: 2,
  };
}