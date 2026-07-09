// =============================================================================
// Checklist grade lifecycle service (Phase 3B-2B Step B).
//
// Pure orchestrator for the checklist-v2 grading background job. Same crash-
// safe contract as resume-screen-runner: takes ONLY a job_id, reloads
// everything else from the database via injected adapters, verifies
// answers_hash / answers_updated_at / questions_hash against the snapshot,
// drives primary + RR Pro Max fallback, validates strict report schema,
// and atomically saves only the checklist stage columns.
//
// No dependency on Supabase, ProTalk, fetch(), timers, or globalThis — all
// I/O lives behind the interfaces below. Production wiring lives in
// supabase/functions/ai-interview-grade-checklist-v2. In-memory wiring
// (fakes) lives in checklist-grade-runner_test.ts.
// =============================================================================
import type { ChecklistGradeReport } from "./ai-validators.ts";

export type JobStatus =
  | "created" | "primary_running" | "primary_failed"
  | "fallback_available" | "fallback_running"
  | "primary_succeeded" | "fallback_succeeded"
  | "save_failed" | "validation_failed" | "fallback_failed"
  | "fallback_unavailable" | "cancelled" | "timed_out"
  | "orchestration_failed";

export type ChecklistQuestion = {
  id: string;
  kind: "choice" | "text";
  question: string;
  /** Hidden from candidate. Used to detect leakage in candidate-visible text. */
  expected?: string;
  /** For choice questions, the canonical correct option (also hidden). */
  correct?: string;
  options?: string[];
};

export type ChecklistJob = {
  id: string;
  candidateId: string;
  projectId: string;
  status: JobStatus;
  fallbackAllowed: boolean;
  snapshot: {
    answers_hash: string;
    answers_updated_at: string;
    questions_hash: string;
    project_id: string;
  };
};

export type ChecklistInput = {
  candidateId: string;
  projectId: string;
  roleName: string;
  vacancyText: string;
  questions: ChecklistQuestion[];
  questionsHash: string;
  answers: Record<string, string>;
  answersHash: string;
  answersUpdatedAt: string;
  employerWishes: string;
};

export type LoadInputError =
  | "answers_missing"
  | "questions_missing"
  | "candidate_not_found"
  | "project_not_found"
  | "internal";

export type ProviderOk = { ok: true; reportJson: unknown; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderFail = { ok: false; errorCode: string; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderResult = ProviderOk | ProviderFail;

export type ValidatorResult =
  | { ok: true; value: ChecklistGradeReport }
  | { ok: false; code: string };

export interface ChecklistJobRepository {
  getJob(jobId: string): Promise<ChecklistJob | null>;
  markStatus(jobId: string, status: JobStatus, completed: boolean): Promise<{ ok: boolean; error?: string }>;
}

export interface ChecklistInputRepository {
  loadInput(job: ChecklistJob): Promise<{ ok: true; input: ChecklistInput } | { ok: false; error: LoadInputError }>;
  computeAnswersHash(answers: Record<string, string>): Promise<string>;
  computeQuestionsHash(questions: ChecklistQuestion[]): Promise<string>;
}

export interface ChecklistAttemptRepository {
  startAttempt(jobId: string, provider: "primary" | "rr_pro_max"): Promise<string | null>;
  finishAttempt(
    attemptId: string,
    patch: { status: "succeeded" | "failed" | "timed_out"; safe_error_code?: string | null },
  ): Promise<void>;
  saveDiagnostics(
    attemptId: string | null,
    diag: {
      chatId?: string | null;
      operationPart?: string | null;
      validationOk?: boolean | null;
      durationMs?: number | null;
      responseMeta?: Record<string, unknown> | null;
    },
  ): Promise<void>;
}

export interface ChecklistBillingAdapter {
  debitOnce(jobId: string, candidateId: string): Promise<
    | { ok: true; already: boolean; hasCredits: boolean }
    | { ok: false; error: string }
  >;
}

export interface ChecklistProviderAdapter {
  fallbackConfigured(): boolean;
  callPrimary(args: { jobId: string; candidateId: string; prompt: string }): Promise<ProviderResult>;
  callFallback(args: { jobId: string; candidateId: string; prompt: string; attempt: number }): Promise<ProviderResult>;
}

export interface ChecklistResultRepository {
  /** MUST write only checklist stage columns. */
  saveChecklistEvaluation(args: {
    candidateId: string;
    report: ChecklistGradeReport;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface ChecklistValidator {
  validate(raw: unknown, input: ChecklistInput): ValidatorResult;
}

export interface ChecklistClock { now(): number; }

export type ChecklistRunnerDeps = {
  jobs: ChecklistJobRepository;
  inputs: ChecklistInputRepository;
  attempts: ChecklistAttemptRepository;
  billing: ChecklistBillingAdapter;
  provider: ChecklistProviderAdapter;
  results: ChecklistResultRepository;
  validator: ChecklistValidator;
  clock: ChecklistClock;
  buildPrompt(input: ChecklistInput): string;
  fallbackAttempts?: number; // default 2
};

export type RunOutcome =
  | { kind: "succeeded"; via: "primary" | "rr_pro_max"; status: "primary_succeeded" | "fallback_succeeded" }
  | { kind: "validation_failed"; code: string }
  | { kind: "save_failed"; code: string }
  | { kind: "no_credits" }
  | { kind: "fallback_unavailable" }
  | { kind: "fallback_failed" }
  | { kind: "orchestration_failed"; code: string }
  | { kind: "noop_terminal"; status: JobStatus }
  | { kind: "noop_missing" };

const TERMINAL = new Set<JobStatus>([
  "primary_succeeded", "fallback_succeeded",
  "save_failed", "validation_failed", "fallback_failed",
  "fallback_unavailable", "cancelled", "timed_out",
  "orchestration_failed",
]);

function safe(code: string): string {
  return code.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 64);
}

export async function runChecklistGradeJob(
  deps: ChecklistRunnerDeps,
  args: { jobId: string },
): Promise<RunOutcome> {
  const fallbackAttempts = Math.max(0, deps.fallbackAttempts ?? 2);

  const job = await deps.jobs.getJob(args.jobId);
  if (!job) return { kind: "noop_missing" };
  if (TERMINAL.has(job.status)) return { kind: "noop_terminal", status: job.status };

  // 2) Reload everything from DB.
  const inputRes = await deps.inputs.loadInput(job);
  if (!inputRes.ok) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: inputRes.error };
  }
  const input = inputRes.input;

  // 3) Hash/version verification — refuse provider call on any drift.
  if (!input.questions || input.questions.length === 0) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "questions_missing" };
  }
  if (!input.answers || Object.keys(input.answers).length === 0) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "answers_missing" };
  }
  const requiredIds = new Set(input.questions.map((q) => q.id));
  for (const qid of requiredIds) {
    const a = (input.answers[qid] || "").toString().trim();
    if (!a) {
      await deps.jobs.markStatus(args.jobId, "validation_failed", true);
      return { kind: "validation_failed", code: "answers_missing" };
    }
  }
  const recomputedAnswers = await deps.inputs.computeAnswersHash(input.answers);
  if (recomputedAnswers !== job.snapshot.answers_hash) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "answers_version_changed" };
  }
  if (
    job.snapshot.answers_updated_at &&
    input.answersUpdatedAt &&
    input.answersUpdatedAt !== job.snapshot.answers_updated_at
  ) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "answers_version_changed" };
  }
  const recomputedQ = await deps.inputs.computeQuestionsHash(input.questions);
  if (recomputedQ !== job.snapshot.questions_hash) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "checklist_version_changed" };
  }

  // 4) Idempotent debit — same business pack as resume.
  const debit = await deps.billing.debitOnce(args.jobId, job.candidateId);
  if (!debit.ok) {
    await deps.jobs.markStatus(args.jobId, "cancelled", true);
    return { kind: "no_credits" };
  }
  if (!debit.hasCredits) {
    await deps.jobs.markStatus(args.jobId, "cancelled", true);
    return { kind: "no_credits" };
  }

  // 5) Primary attempt
  const prompt = deps.buildPrompt(input);
  let report: ChecklistGradeReport | null = null;
  let primaryDone = false;

  const pStart = deps.clock.now();
  const primaryAttemptId = await deps.attempts.startAttempt(args.jobId, "primary");
  if (!primaryAttemptId) {
    await deps.jobs.markStatus(args.jobId, "orchestration_failed", true);
    return { kind: "orchestration_failed", code: "attempt_start_failed" };
  }
  await deps.jobs.markStatus(args.jobId, "primary_running", false);
  const pRes = await deps.provider.callPrimary({ jobId: args.jobId, candidateId: job.candidateId, prompt });
  if (pRes.ok) {
    const v = deps.validator.validate(pRes.reportJson, input);
    await deps.attempts.saveDiagnostics(primaryAttemptId, {
      chatId: pRes.chatId ?? null,
      operationPart: "checklist_grade",
      validationOk: v.ok,
      durationMs: pRes.durationMs ?? (deps.clock.now() - pStart),
      responseMeta: { provider: "primary", attempts: pRes.attempts ?? 1, schema_code: v.ok ? null : v.code },
    });
    if (v.ok) {
      report = v.value;
      primaryDone = true;
      await deps.attempts.finishAttempt(primaryAttemptId, { status: "succeeded" });
    } else {
      await deps.attempts.finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: safe(`schema:${v.code}`) });
    }
  } else {
    await deps.attempts.saveDiagnostics(primaryAttemptId, {
      chatId: pRes.chatId ?? null,
      operationPart: "checklist_grade",
      validationOk: false,
      durationMs: pRes.durationMs ?? (deps.clock.now() - pStart),
      responseMeta: { provider: "primary", attempts: pRes.attempts ?? 1, error_code: safe(pRes.errorCode) },
    });
    await deps.attempts.finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: safe(pRes.errorCode) });
  }

  // 6) Fallback (RR Pro Max)
  if (!report) {
    await deps.jobs.markStatus(args.jobId, "primary_failed", false);
    if (!job.fallbackAllowed || !deps.provider.fallbackConfigured()) {
      await deps.jobs.markStatus(args.jobId, "fallback_unavailable", true);
      return { kind: "fallback_unavailable" };
    }
    await deps.jobs.markStatus(args.jobId, "fallback_available", false);
    for (let i = 1; i <= fallbackAttempts && !report; i++) {
      const fbStart = deps.clock.now();
      const fbId = await deps.attempts.startAttempt(args.jobId, "rr_pro_max");
      if (!fbId) {
        await deps.jobs.markStatus(args.jobId, "orchestration_failed", true);
        return { kind: "orchestration_failed", code: "fallback_start_failed" };
      }
      await deps.jobs.markStatus(args.jobId, "fallback_running", false);
      const f = await deps.provider.callFallback({
        jobId: args.jobId, candidateId: job.candidateId, prompt, attempt: i,
      });
      if (f.ok) {
        const v = deps.validator.validate(f.reportJson, input);
        await deps.attempts.saveDiagnostics(fbId, {
          chatId: f.chatId ?? null,
          operationPart: "checklist_grade",
          validationOk: v.ok,
          durationMs: f.durationMs ?? (deps.clock.now() - fbStart),
          responseMeta: { provider: "rr_pro_max", attempt: i, schema_code: v.ok ? null : v.code },
        });
        if (v.ok) {
          report = v.value;
          await deps.attempts.finishAttempt(fbId, { status: "succeeded" });
        } else {
          await deps.attempts.finishAttempt(fbId, { status: "failed", safe_error_code: safe(`schema:${v.code}`) });
        }
      } else {
        await deps.attempts.saveDiagnostics(fbId, {
          chatId: f.chatId ?? null,
          operationPart: "checklist_grade",
          validationOk: false,
          durationMs: f.durationMs ?? (deps.clock.now() - fbStart),
          responseMeta: { provider: "rr_pro_max", attempt: i, error_code: safe(f.errorCode) },
        });
        await deps.attempts.finishAttempt(fbId, { status: "failed", safe_error_code: safe(f.errorCode) });
      }
    }
    if (!report) {
      await deps.jobs.markStatus(args.jobId, "fallback_failed", true);
      return { kind: "fallback_failed" };
    }
  }

  // 7) Atomic stage-only save.
  const saveRes = await deps.results.saveChecklistEvaluation({ candidateId: job.candidateId, report });
  if (!saveRes.ok) {
    await deps.jobs.markStatus(args.jobId, "save_failed", true);
    return { kind: "save_failed", code: safe(saveRes.error || "save_failed") };
  }

  // 8) Terminal status — strict.
  const finalStatus: JobStatus = primaryDone ? "primary_succeeded" : "fallback_succeeded";
  const term = await deps.jobs.markStatus(args.jobId, finalStatus, true);
  if (!term.ok) {
    await deps.jobs.markStatus(args.jobId, "save_failed", true);
    return { kind: "save_failed", code: safe(`status_update:${term.error || "unknown"}`) };
  }
  return { kind: "succeeded", via: primaryDone ? "primary" : "rr_pro_max", status: finalStatus };
}

export const __internal_terminal_statuses = TERMINAL;