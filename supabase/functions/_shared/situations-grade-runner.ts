// =============================================================================
// Situations grade lifecycle service (Phase 3B-2B Step C).
//
// Pure orchestrator for the situations-v2 grading background job. Same
// crash-safe contract as resume-screen-runner and checklist-grade-runner:
// takes ONLY a job_id, reloads everything else from the database via
// injected adapters, verifies answers_hash / answers_updated_at /
// situations_hash against the snapshot, drives primary + RR Pro Max
// fallback, validates strict report schema, and atomically saves only the
// situations stage columns.
//
// No dependency on Supabase, ProTalk, fetch(), timers, or globalThis — all
// I/O lives behind the interfaces below. Production wiring lives in
// supabase/functions/ai-interview-grade-situations-v2. In-memory wiring
// (fakes) lives in situations-grade-runner_test.ts.
// =============================================================================
import type { SituationsGradeReport } from "./ai-validators.ts";

export type JobStatus =
  | "created" | "primary_running" | "primary_failed"
  | "fallback_available" | "fallback_running"
  | "primary_succeeded" | "fallback_succeeded"
  | "save_failed" | "validation_failed" | "fallback_failed"
  | "fallback_unavailable" | "cancelled" | "timed_out"
  | "orchestration_failed";

export type SituationItem = {
  id: string;
  title: string;
  brief: string;
  /** Hidden from candidate. Used to flag criteria leakage. */
  criteria?: string;
};

export type SituationsJob = {
  id: string;
  candidateId: string;
  projectId: string;
  status: JobStatus;
  fallbackAllowed: boolean;
  snapshot: {
    answers_hash: string;
    answers_updated_at: string;
    situations_hash: string;
    project_id: string;
  };
};

export type SituationsInput = {
  candidateId: string;
  projectId: string;
  roleName: string;
  vacancyText: string;
  situations: SituationItem[];
  situationsHash: string;
  answers: Record<string, string>;
  answersHash: string;
  answersUpdatedAt: string;
  employerWishes: string;
};

export type LoadInputError =
  | "answers_missing"
  | "situations_missing"
  | "candidate_not_found"
  | "project_not_found"
  | "internal";

export type ProviderOk = { ok: true; reportJson: unknown; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderFail = { ok: false; errorCode: string; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderResult = ProviderOk | ProviderFail;

export type ValidatorResult =
  | { ok: true; value: SituationsGradeReport }
  | { ok: false; code: string };

export interface SituationsJobRepository {
  getJob(jobId: string): Promise<SituationsJob | null>;
  markStatus(jobId: string, status: JobStatus, completed: boolean): Promise<{ ok: boolean; error?: string }>;
}

export interface SituationsInputRepository {
  loadInput(job: SituationsJob): Promise<{ ok: true; input: SituationsInput } | { ok: false; error: LoadInputError }>;
  computeAnswersHash(answers: Record<string, string>): Promise<string>;
  computeSituationsHash(situations: SituationItem[]): Promise<string>;
}

export interface SituationsAttemptRepository {
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

export interface SituationsBillingAdapter {
  debitOnce(jobId: string, candidateId: string): Promise<
    | { ok: true; already: boolean; hasCredits: boolean }
    | { ok: false; error: string }
  >;
}

export interface SituationsProviderAdapter {
  fallbackConfigured(): boolean;
  callPrimary(args: { jobId: string; candidateId: string; prompt: string }): Promise<ProviderResult>;
  callFallback(args: { jobId: string; candidateId: string; prompt: string; attempt: number }): Promise<ProviderResult>;
}

export interface SituationsResultRepository {
  /** MUST write only situations stage columns. */
  saveSituationsEvaluation(args: {
    candidateId: string;
    report: SituationsGradeReport;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface SituationsValidator {
  validate(raw: unknown, input: SituationsInput): ValidatorResult;
}

export interface SituationsClock { now(): number; }

export type SituationsRunnerDeps = {
  jobs: SituationsJobRepository;
  inputs: SituationsInputRepository;
  attempts: SituationsAttemptRepository;
  billing: SituationsBillingAdapter;
  provider: SituationsProviderAdapter;
  results: SituationsResultRepository;
  validator: SituationsValidator;
  clock: SituationsClock;
  buildPrompt(input: SituationsInput): string;
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

export async function runSituationsGradeJob(
  deps: SituationsRunnerDeps,
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
  if (!input.situations || input.situations.length === 0) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "situations_missing" };
  }
  if (!input.answers || Object.keys(input.answers).length === 0) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "answers_missing" };
  }
  const requiredIds = new Set(input.situations.map((s) => s.id));
  for (const sid of requiredIds) {
    const a = (input.answers[sid] || "").toString().trim();
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
  const recomputedS = await deps.inputs.computeSituationsHash(input.situations);
  if (recomputedS !== job.snapshot.situations_hash) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "situations_version_changed" };
  }

  // 4) Idempotent debit — same business pack as resume + checklist.
  const debit = await deps.billing.debitOnce(args.jobId, job.candidateId);
  if (!debit.ok) {
    await deps.jobs.markStatus(args.jobId, "cancelled", true);
    return { kind: "no_credits" };
  }
  if (!debit.hasCredits) {
    await deps.jobs.markStatus(args.jobId, "cancelled", true);
    return { kind: "no_credits" };
  }

  // 5) Primary attempt — skipped when watchdog resumes a stuck job
  // (status ∈ {primary_running, primary_failed, fallback_available,
  // fallback_running}); those states mean primary was killed mid-flight
  // or already failed — jump straight to fallback.
  const prompt = deps.buildPrompt(input);
  let report: SituationsGradeReport | null = null;
  let primaryDone = false;
  const resumeFromFallback =
    job.status === "primary_running" ||
    job.status === "primary_failed" ||
    job.status === "fallback_available" ||
    job.status === "fallback_running";

  const pStart = deps.clock.now();
  const primaryAttemptId = resumeFromFallback
    ? null
    : await deps.attempts.startAttempt(args.jobId, "primary");
  if (!resumeFromFallback && !primaryAttemptId) {
    await deps.jobs.markStatus(args.jobId, "orchestration_failed", true);
    return { kind: "orchestration_failed", code: "attempt_start_failed" };
  }
  if (!resumeFromFallback) {
    await deps.jobs.markStatus(args.jobId, "primary_running", false);
  }
  const pRes: ProviderResult = resumeFromFallback
    ? { ok: false, errorCode: "primary_skipped_watchdog" }
    : await deps.provider.callPrimary({ jobId: args.jobId, candidateId: job.candidateId, prompt });
  if (pRes.ok && primaryAttemptId) {
    const v = deps.validator.validate(pRes.reportJson, input);
    await deps.attempts.saveDiagnostics(primaryAttemptId, {
      chatId: pRes.chatId ?? null,
      operationPart: "situations_grade",
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
  } else if (!pRes.ok && primaryAttemptId) {
    await deps.attempts.saveDiagnostics(primaryAttemptId, {
      chatId: pRes.chatId ?? null,
      operationPart: "situations_grade",
      validationOk: false,
      durationMs: pRes.durationMs ?? (deps.clock.now() - pStart),
      responseMeta: { provider: "primary", attempts: pRes.attempts ?? 1, error_code: safe(pRes.errorCode) },
    });
    await deps.attempts.finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: safe(pRes.errorCode) });
  }

  // 6) Fallback
  if (!report) {
    await deps.jobs.markStatus(args.jobId, "primary_failed", false);
    if (!deps.provider.fallbackConfigured() || !job.fallbackAllowed) {
      await deps.jobs.markStatus(args.jobId, "fallback_unavailable", true);
      return { kind: "fallback_unavailable" };
    }
    await deps.jobs.markStatus(args.jobId, "fallback_available", false);
    for (let i = 1; i <= fallbackAttempts && !report; i++) {
      const fbStart = deps.clock.now();
      const fbId = await deps.attempts.startAttempt(args.jobId, "rr_pro_max");
      if (!fbId) {
        await deps.jobs.markStatus(args.jobId, "orchestration_failed", true);
        return { kind: "orchestration_failed", code: "fallback_attempt_start_failed" };
      }
      await deps.jobs.markStatus(args.jobId, "fallback_running", false);
      const f = await deps.provider.callFallback({
        jobId: args.jobId, candidateId: job.candidateId, prompt, attempt: i,
      });
      if (f.ok) {
        const v = deps.validator.validate(f.reportJson, input);
        await deps.attempts.saveDiagnostics(fbId, {
          chatId: f.chatId ?? null,
          operationPart: "situations_grade",
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
          operationPart: "situations_grade",
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
  const saveRes = await deps.results.saveSituationsEvaluation({ candidateId: job.candidateId, report });
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