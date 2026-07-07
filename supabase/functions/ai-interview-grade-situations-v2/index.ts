// =============================================================================
// ai-interview-grade-situations-v2  (Phase 3B-2B Step C)
//
// Crash-safe v2 variant of role-play situations grading. Same architecture
// as ai-interview-grade-checklist-v2:
//   1. validates the candidate token and request_id
//   2. resolves project_id, situations block server-side
//   3. atomically saves the answers + answers_hash + updated_at via
//      save_situations_answers_v2 RPC (composite PK candidate_id,
//      project_id)
//   4. computes situations_hash from the current interview_blocks payload
//   5. creates or reuses an ai_jobs row (idempotency:
//      situations_grade_v2:${candidate_id}:${request_id})
//   6. spawns the background worker with ONLY {jobId}; worker reloads
//      everything from DB and refuses to call the provider on any drift.
//
// Live rollback: ai-interview-grade-situations (v1) is untouched.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildChatId, buildSocialId, callProTalkWithRetry, tryParseJson, resolveCandidatePublicId,
  getAdminClient, logToDb,
} from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import {
  canonicalJsonStringify, createOrReuseAiJob, debitAiJobOnce,
  finishAttempt as ajFinishAttempt, isTerminalStatus, markJobStatusStrict,
  recordAttemptDiagnostics, sha256Hex, startAttempt as ajStartAttempt,
} from "../_shared/ai-jobs.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import {
  validateSituationsGradeReport,
} from "../_shared/ai-validators.ts";
import {
  runSituationsGradeJob,
  type SituationsRunnerDeps, type SituationsJob, type SituationsInput,
  type ProviderResult, type JobStatus, type SituationItem,
} from "../_shared/situations-grade-runner.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function answersHash(answers: Record<string, string>): Promise<string> {
  const normalized: Record<string, string> = {};
  for (const k of Object.keys(answers).sort()) {
    normalized[k] = String(answers[k] ?? "").trim();
  }
  return await sha256Hex(canonicalJsonStringify(normalized));
}
async function situationsHash(items: SituationItem[]): Promise<string> {
  const norm = items.map((s) => ({
    id: s.id, title: s.title, brief: s.brief, criteria: s.criteria || null,
  }));
  return await sha256Hex(canonicalJsonStringify(norm));
}
function normalizeSituation(raw: any): SituationItem {
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    brief: String(raw?.brief || ""),
    criteria: raw?.criteria ? String(raw.criteria) : undefined,
  };
}

export function buildProdDeps(adminAny: ReturnType<typeof getAdminClient>): SituationsRunnerDeps {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    request_id?: string;
    candidate_token?: string;
    answers?: Record<string, string>;
    async_version?: number;
  };
  if (!body) return jsonResponse({ error: "bad_body" }, 400);
  const requestId = String(body.request_id || "").trim();
  if (!UUID_RE.test(requestId)) return jsonResponse({ error: "bad_request_id" }, 400);
  if (body.async_version !== 2) return jsonResponse({ error: "bad_async_version" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  const er = (globalThis as any).EdgeRuntime;
  if (!er || typeof er.waitUntil !== "function") {
    return jsonResponse({ error: "runtime_no_background" }, 500);
  }

  // Resolve project + situations server-side; never trust client.
  const { data: cand } = await admin
    .from("candidates").select("id, project_id").eq("id", candidateId).maybeSingle();
  if (!cand?.project_id) return jsonResponse({ error: "no_project" }, 400);
  const projectId = (cand as any).project_id as string;

  const { data: blk } = await admin
    .from("interview_blocks").select("payload")
    .eq("project_id", projectId).eq("kind", "situations").maybeSingle();
  const rawSs: any[] = (blk as any)?.payload?.situations || [];
  if (!rawSs.length) return jsonResponse({ error: "no_situations" }, 400);
  const situations = rawSs.map(normalizeSituation);

  // Resolve answers. Prefer body.answers (caller-sent), fall back to stored.
  const incoming = (body.answers && typeof body.answers === "object") ? body.answers : null;
  let answers: Record<string, string> | null = null;
  if (incoming) {
    const normalized: Record<string, string> = {};
    for (const s of situations) {
      const v = (incoming as any)[s.id];
      if (v != null) normalized[s.id] = String(v);
    }
    answers = normalized;
  } else {
    const { data: ansRow } = await admin
      .from("candidate_situations_answers_v2")
      .select("answers")
      .eq("candidate_id", candidateId)
      .eq("project_id", projectId)
      .maybeSingle();
    answers = ((ansRow as any)?.answers || null) as Record<string, string> | null;
  }
  if (!answers || Object.keys(answers).length === 0) {
    return jsonResponse({ error: "no_answers" }, 400);
  }
  for (const s of situations) {
    if (!(answers[s.id] || "").toString().trim()) {
      return jsonResponse({ error: "answers_incomplete", missing: s.id }, 400);
    }
  }

  // Atomically save answers + hash + updated_at via server-only RPC.
  const aHash = await answersHash(answers);
  const saved = await admin.rpc("save_situations_answers_v2", {
    _candidate: candidateId,
    _project: projectId,
    _answers: answers as unknown as Record<string, unknown>,
    _answers_hash: aHash,
  });
  if (saved.error) {
    return jsonResponse({ error: "answers_save_failed", detail: saved.error.message.slice(0, 80) }, 500);
  }
  const answersUpdatedAt = String((saved.data as any)?.updated_at || "");
  const sHash = await situationsHash(situations);

  const idem = `situations_grade_v2:${candidateId}:${requestId}`;
  const created = await createOrReuseAiJob({
    userId: null,
    candidateId,
    jobType: "grade_situations_v2",
    idempotencyKey: idem,
    requestSnapshot: {
      candidate_id: candidateId,
      project_id: projectId,
      answers_hash: aHash,
      answers_updated_at: answersUpdatedAt,
      situations_hash: sHash,
      requested_at: new Date().toISOString(),
    },
    fallbackAllowed: true,
  });
  if ("error" in created) return jsonResponse({ error: "job_create_failed", detail: created.error }, 500);

  if (created.reused) {
    return jsonResponse({
      ok: true, job_id: created.id, status: created.status,
      reused: true, terminal: isTerminalStatus(created.status),
    });
  }

  const jobId = created.id;
  const prodDeps = buildProdDeps(admin);
  runInBackground((async () => {
    try {
      const outcome = await runSituationsGradeJob(prodDeps, { jobId });
      if (outcome.kind === "save_failed") {
        try { await logToDb({
          user_message: "[v2 situations save failed]",
          bot_reply: outcome.code,
          channel_id: `job_${jobId}`,
          user_social_id: candidateId,
          channel_name: "ai-interview:grade-situations-v2",
          server_name: "ai-interview-grade-situations-v2",
          function_error: outcome.code,
        }); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("[grade-situations-v2] background crashed", (e as Error)?.message);
      await markJobStatusStrict(jobId, "orchestration_failed", true);
    }
  })());

  return jsonResponse({
    ok: true, job_id: jobId, status: "primary_running",
    reused: false, terminal: false,
  });
});