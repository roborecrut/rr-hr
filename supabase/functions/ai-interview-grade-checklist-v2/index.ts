// =============================================================================
// ai-interview-grade-checklist-v2  (Phase 3B-2B Step B)
//
// Crash-safe v2 variant of checklist grading. The HTTP handler:
//   1. validates the candidate token and request_id
//   2. atomically saves the answers (project_id, hash, updated_at) via
//      save_checklist_answers_v2 RPC
//   3. computes questions_hash from the current interview_blocks payload
//   4. creates or reuses an ai_jobs row (idempotency: checklist_grade_v2:
//      ${candidate_id}:${request_id})
//   5. spawns the background worker with ONLY {jobId}; worker reloads
//      everything from DB and refuses to call the provider on any drift.
//
// Live rollback: ai-interview-grade-checklist (v1) is untouched.
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
  validateChecklistGradeReport, type ChecklistGradeReport,
} from "../_shared/ai-validators.ts";
import {
  runChecklistGradeJob,
  type ChecklistRunnerDeps, type ChecklistJob, type ChecklistInput,
  type ProviderResult, type JobStatus, type ChecklistQuestion,
} from "../_shared/checklist-grade-runner.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildPrompt(input: ChecklistInput): string {
  const safeQs = input.questions.map((q) => ({
    id: q.id, kind: q.kind, question: q.question,
    options: q.options || null,
    expected: q.expected || null,
    correct: q.correct || null,
    answer: (input.answers[q.id] || "").toString().slice(0, 3000),
  }));
  return `Ты — старший HR-эксперт. Оцени ответы кандидата на анкету интервью строго по эталонам работодателя.

ВАЖНЫЕ ПРАВИЛА:
1. НИКОГДА не используй сведения о возрасте, поле, расе, национальности, религии, политических взглядах, семейном положении, беременности, здоровье, инвалидности, внешности — эти признаки НЕ влияют на оценку.
2. Каждый risk и red_flag обязан содержать конкретное evidence (точная цитата или формулировка «ответ обтекаемый по критерию X»).
3. Не делай кадровое решение «нанимать/не нанимать» — формируй экспертное мнение для финального решения работодателя.
4. В candidate-разделе запрещено упоминать expected/correct, employer wishes, risks, red_flags. Не цитируй внутренние эталоны.
5. Тон candidate-раздела — уважительный, мягкий, профессиональный, без унижения.
6. Каждый вопрос обязан попасть и в employer.items, и в candidate.items (по одному элементу).

ВАКАНСИЯ: ${input.roleName}
ОПИСАНИЕ ВАКАНСИИ:
${(input.vacancyText || "(не указано)").slice(0, 4000)}

ПОЖЕЛАНИЯ РАБОТОДАТЕЛЯ:
${(input.employerWishes || "(не заданы)").slice(0, 2000)}

ПРАВИЛО РАСЧЕТА БАЛЛОВ: Всего вопросов: ${safeQs.length}. Общая сумма баллов на все вопросы строго 100 баллов. Распределяй максимальный балл поровну между всеми вопросами (например, если 20 вопросов — каждый максимум 5 баллов, в сумме ровно 100). Поле score в элементах items должно быть от 0 до максимального балла за вопрос. Поле total должно быть суммой баллов за все вопросы (максимум 100).

ВОПРОСЫ И ОТВЕТЫ КАНДИДАТА (${safeQs.length} шт):
${JSON.stringify(safeQs)}

Верни СТРОГО валидный JSON без markdown:
{
  "total": <integer 0..100>,
  "employer": {
    "summary": "<6-10 предложений эксперту-работодателю>",
    "strengths": ["..."],
    "gaps": [{"criterion":"...","finding":"...","impact":"..."}],
    "risks": [{"title":"...","evidence":"...","severity":"<низкий|средний|высокий>","how_to_verify":"..."}],
    "red_flags": [{"title":"...","evidence":"...","severity":"<средний|высокий>"}],
    "items": [{"question_id":"qN","score":<баллы от 0 до макс за этот вопрос>,"employer_feedback":"...","evidence":"..."}]
  },
  "candidate": {
    "summary": "<мягкий итог для кандидата>",
    "strengths": ["..."],
    "areas_to_improve": ["..."],
    "items": [{"question_id":"qN","score":<баллы от 0 до макс за этот вопрос>,"feedback":"...","recommendation":"..."}]
  }
}`;
}

// Stable canonical hash for answers (sorted keys, trimmed values).
async function answersHash(answers: Record<string, string>): Promise<string> {
  const normalized: Record<string, string> = {};
  for (const k of Object.keys(answers).sort()) {
    normalized[k] = String(answers[k] ?? "").trim();
  }
  return await sha256Hex(canonicalJsonStringify(normalized));
}
async function questionsHash(qs: ChecklistQuestion[]): Promise<string> {
  const norm = qs.map((q) => ({
    id: q.id, kind: q.kind, question: q.question,
    options: q.options || null,
    expected: q.expected || null, correct: q.correct || null,
  }));
  return await sha256Hex(canonicalJsonStringify(norm));
}
function normalizeQuestion(raw: any): ChecklistQuestion {
  const kind = (raw?.kind === "choice") ? "choice" : "text";
  return {
    id: String(raw?.id || ""),
    kind,
    question: String(raw?.question || ""),
    expected: raw?.expected_answer ? String(raw.expected_answer) : undefined,
    correct: raw?.correct ? String(raw.correct) : undefined,
    options: Array.isArray(raw?.options) ? raw.options.map((o: any) => String(o)) : undefined,
  };
}

function buildProdDeps(adminAny: ReturnType<typeof getAdminClient>): ChecklistRunnerDeps {
  const admin = adminAny!;
  return {
    jobs: {
      async getJob(jobId): Promise<ChecklistJob | null> {
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
            questions_hash: String(snap.questions_hash || ""),
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
          .eq("project_id", job.projectId).eq("kind", "checklist").maybeSingle();
        const rawQs: any[] = (blk as any)?.payload?.questions || [];
        if (!rawQs.length) return { ok: false, error: "questions_missing" };
        const employerWishes = String(((blk as any)?.payload?.employer_wishes) || "");
        const questions = rawQs.map(normalizeQuestion);
        const { data: ansRow } = await admin
          .from("candidate_checklist_answers_v2")
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
            questions,
            questionsHash: await questionsHash(questions),
            answers,
            answersHash: String((ansRow as any).answers_hash || (await answersHash(answers))),
            answersUpdatedAt: String((ansRow as any).updated_at || ""),
            employerWishes,
          },
        };
      },
      async computeAnswersHash(a) { return await answersHash(a); },
      async computeQuestionsHash(q) { return await questionsHash(q); },
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
        const r = await debitAiJobOnce(jobId, candidateId, "checklist_grade");
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
              // Light schema check (full validation runs in the runner).
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
          const r = await RrProMaxProvider.run(prompt, chat, social, 180_000);
          if (!r.ok) return { ok: false, errorCode: r.safeErrorCode, chatId: chat, durationMs: Date.now() - startedAt };
          return { ok: true, reportJson: tryParseJson<unknown>(r.text), chatId: chat, durationMs: Date.now() - startedAt };
        } catch (e) {
          return { ok: false, errorCode: String((e as Error).message || "fallback_failed").slice(0, 64), chatId: chat, durationMs: Date.now() - startedAt };
        }
      },
    },
    results: {
      async saveChecklistEvaluation({ candidateId, report }) {
        const r = await admin.rpc("save_candidate_checklist_evaluation_v2", {
          _candidate: candidateId,
          _checklist_score: report.total,
          _checklist_feedback: report.employer as unknown as Record<string, unknown>,
          _candidate_checklist_feedback: report.candidate as unknown as Record<string, unknown>,
        });
        if (r.error) return { ok: false, error: r.error.message };
        return { ok: true };
      },
    },
    validator: {
      validate: (raw, input) => {
        const expectedAnswers: Record<string, string> = {};
        for (const q of input.questions) {
          if (q.expected) expectedAnswers[q.id] = q.expected;
          else if (q.correct) expectedAnswers[q.id] = q.correct;
        }
        return validateChecklistGradeReport(raw, {
          allowedQuestionIds: input.questions.map((q) => q.id),
          expectedAnswers,
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

  // Resolve project + checklist questions server-side; never trust client.
  const { data: cand } = await admin
    .from("candidates").select("id, project_id").eq("id", candidateId).maybeSingle();
  if (!cand?.project_id) return jsonResponse({ error: "no_project" }, 400);

  const { data: blk } = await admin
    .from("interview_blocks").select("payload")
    .eq("project_id", cand.project_id).eq("kind", "checklist").maybeSingle();
  const rawQs: any[] = (blk as any)?.payload?.questions || [];
  if (!rawQs.length) return jsonResponse({ error: "no_questions" }, 400);
  const questions = rawQs.map(normalizeQuestion);

  // Resolve answers. Prefer body.answers (caller-sent), fall back to stored.
  const incoming = (body.answers && typeof body.answers === "object") ? body.answers : null;
  let answers: Record<string, string> | null = null;
  if (incoming) {
    const normalized: Record<string, string> = {};
    for (const q of questions) {
      const v = (incoming as any)[q.id];
      if (v != null) normalized[q.id] = String(v);
    }
    answers = normalized;
  } else {
    const { data: ansRow } = await admin
      .from("candidate_checklist_answers_v2")
      .select("answers")
      .eq("candidate_id", candidateId)
      .eq("project_id", cand.project_id)
      .maybeSingle();
    answers = ((ansRow as any)?.answers || null) as Record<string, string> | null;
  }
  if (!answers || Object.keys(answers).length === 0) {
    return jsonResponse({ error: "no_answers" }, 400);
  }
  // Ensure every required question has a non-empty answer.
  for (const q of questions) {
    if (!(answers[q.id] || "").toString().trim()) {
      return jsonResponse({ error: "answers_incomplete", missing: q.id }, 400);
    }
  }

  // Atomically save answers + hash + updated_at via server-only RPC.
  const aHash = await answersHash(answers);
  const saved = await admin.rpc("save_checklist_answers_v2", {
    _candidate: candidateId,
    _project: cand.project_id,
    _answers: answers as unknown as Record<string, unknown>,
    _answers_hash: aHash,
  });
  if (saved.error) {
    return jsonResponse({ error: "answers_save_failed", detail: saved.error.message.slice(0, 80) }, 500);
  }
  const answersUpdatedAt = String((saved.data as any)?.updated_at || "");
  const qHash = await questionsHash(questions);

  const idem = `checklist_grade_v2:${candidateId}:${requestId}`;
  const created = await createOrReuseAiJob({
    userId: null,
    candidateId,
    jobType: "grade_checklist_v2",
    idempotencyKey: idem,
    requestSnapshot: {
      candidate_id: candidateId,
      project_id: cand.project_id,
      answers_hash: aHash,
      answers_updated_at: answersUpdatedAt,
      questions_hash: qHash,
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
      const outcome = await runChecklistGradeJob(prodDeps, { jobId });
      if (outcome.kind === "save_failed") {
        try { await logToDb({
          user_message: "[v2 checklist save failed]",
          bot_reply: outcome.code,
          channel_id: `job_${jobId}`,
          user_social_id: candidateId,
          channel_name: "ai-interview:grade-checklist-v2",
          server_name: "ai-interview-grade-checklist-v2",
          function_error: outcome.code,
        }); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("[grade-checklist-v2] background crashed", (e as Error)?.message);
      await markJobStatusStrict(jobId, "orchestration_failed", true);
    }
  })());

  return jsonResponse({
    ok: true, job_id: jobId, status: "primary_running",
    reused: false, terminal: false,
  });
});