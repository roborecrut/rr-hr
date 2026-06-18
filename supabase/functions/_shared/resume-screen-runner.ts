// =============================================================================
// Resume screen lifecycle service (Phase 3B-2A.1).
//
// Pure orchestrator: takes a `job_id` and an injectable set of adapters, runs
// the full background lifecycle of a resume-screen AI job, and returns a
// terminal outcome. Has NO direct dependency on Supabase, ProTalk, RR Pro Max,
// fetch(), timers, or globalThis — all I/O lives behind the interfaces below.
// This is what makes the lifecycle testable in-memory without burning real
// credits or hitting any external service.
//
// Production wiring lives in supabase/functions/ai-interview-screen-resume-v2.
// In-memory wiring (fakes) lives in resume-screen-runner_test.ts.
// =============================================================================
import type { ResumeScreenReport } from "./ai-validators.ts";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type JobStatus =
  | "created" | "primary_running" | "primary_failed"
  | "fallback_available" | "fallback_running"
  | "primary_succeeded" | "fallback_succeeded"
  | "save_failed" | "validation_failed" | "fallback_failed"
  | "fallback_unavailable" | "cancelled" | "timed_out";

export type ResumeJob = {
  id: string;
  candidateId: string;
  projectId: string;
  status: JobStatus;
  fallbackAllowed: boolean;
  snapshot: {
    resume_hash: string;
    resume_updated_at: string;
    criteria_hash: string;
    project_id: string;
  };
};

export type ResumeInput = {
  candidateId: string;
  projectId: string;
  resumeText: string;
  resumeHash: string;          // recomputed from actual DB text
  resumeUpdatedAt: string;     // ISO timestamp from DB
  criteria: string;
  criteriaHash: string;        // recomputed from actual DB criteria
  roleName: string;
  vacancyText: string;
};

export type LoadInputError =
  | "resume_text_missing"
  | "candidate_not_found"
  | "project_not_found"
  | "internal";

export type ProviderOk = { ok: true; reportJson: unknown; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderFail = { ok: false; errorCode: string; chatId?: string; durationMs?: number; attempts?: number };
export type ProviderResult = ProviderOk | ProviderFail;

export type ValidatorResult =
  | { ok: true; value: ResumeScreenReport }
  | { ok: false; code: string };

// ---------------------------------------------------------------------------
// Injectable adapters
// ---------------------------------------------------------------------------

export interface ResumeJobRepository {
  getJob(jobId: string): Promise<ResumeJob | null>;
  markStatus(jobId: string, status: JobStatus, completed: boolean): Promise<{ ok: boolean; error?: string }>;
}

export interface ResumeInputRepository {
  /** Reload everything the worker needs from the database, fresh. */
  loadResumeInput(job: ResumeJob): Promise<{ ok: true; input: ResumeInput } | { ok: false; error: LoadInputError }>;
  /** Stable hash used by both the sync entry-point and the worker. */
  computeResumeHash(text: string): Promise<string>;
}

export interface ResumeAttemptRepository {
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

export interface ResumeBillingAdapter {
  /** Idempotent debit. `already=true` for retries / duplicates. `hasCredits=false` when wallet rejected. */
  debitOnce(jobId: string, candidateId: string): Promise<
    | { ok: true; already: boolean; hasCredits: boolean }
    | { ok: false; error: string }
  >;
}

export interface ResumeProviderAdapter {
  fallbackConfigured(): boolean;
  /** Primary provider with its OWN retry policy internally (e.g. callProTalkWithRetry). */
  callPrimary(args: { jobId: string; candidateId: string; prompt: string }): Promise<ProviderResult>;
  /** Single fallback attempt. Caller wraps it in its own outer loop. */
  callFallback(args: { jobId: string; candidateId: string; prompt: string; attempt: number }): Promise<ProviderResult>;
}

export interface ResumeResultRepository {
  saveResumeEvaluation(args: {
    candidateId: string;
    report: ResumeScreenReport;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface ResumeValidator {
  validate(raw: unknown): ValidatorResult;
}

export interface ResumeClock {
  now(): number;
}

export type ResumeRunnerDeps = {
  jobs: ResumeJobRepository;
  inputs: ResumeInputRepository;
  attempts: ResumeAttemptRepository;
  billing: ResumeBillingAdapter;
  provider: ResumeProviderAdapter;
  results: ResumeResultRepository;
  validator: ResumeValidator;
  clock: ResumeClock;
  buildPrompt(input: ResumeInput): string;
  fallbackAttempts?: number; // default 2
};

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export type RunOutcome =
  | { kind: "succeeded"; via: "primary" | "rr_pro_max"; status: "primary_succeeded" | "fallback_succeeded" }
  | { kind: "validation_failed"; code: string }
  | { kind: "save_failed"; code: string }
  | { kind: "no_credits" }
  | { kind: "fallback_unavailable" }
  | { kind: "fallback_failed" }
  | { kind: "primary_failed" }
  | { kind: "noop_terminal"; status: JobStatus }
  | { kind: "noop_missing" };

const TERMINAL = new Set<JobStatus>([
  "primary_succeeded", "fallback_succeeded",
  "save_failed", "validation_failed", "fallback_failed",
  "fallback_unavailable", "cancelled", "timed_out",
]);

function safe(code: string): string {
  return code.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 64);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runResumeScreenJob(
  deps: ResumeRunnerDeps,
  args: { jobId: string },
): Promise<RunOutcome> {
  const fallbackAttempts = Math.max(0, deps.fallbackAttempts ?? 2);

  // 1) Load job
  const job = await deps.jobs.getJob(args.jobId);
  if (!job) return { kind: "noop_missing" };
  if (TERMINAL.has(job.status)) return { kind: "noop_terminal", status: job.status };

  // 2) Load fresh resume input from DB
  const inputRes = await deps.inputs.loadResumeInput(job);
  if (!inputRes.ok) {
    const code = inputRes.error;
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code };
  }
  const input = inputRes.input;

  // 3) Verify resume hash/version vs snapshot. If user edited resume mid-job,
  //    do NOT call the provider for a different version. Preserve prior
  //    successful report and surface a stable error code to the client.
  if (!input.resumeText || input.resumeText.length < 50) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "resume_text_missing" };
  }
  const recomputed = await deps.inputs.computeResumeHash(input.resumeText);
  if (recomputed !== job.snapshot.resume_hash) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "resume_version_changed" };
  }
  if (
    job.snapshot.resume_updated_at &&
    input.resumeUpdatedAt &&
    input.resumeUpdatedAt !== job.snapshot.resume_updated_at
  ) {
    await deps.jobs.markStatus(args.jobId, "validation_failed", true);
    return { kind: "validation_failed", code: "resume_version_changed" };
  }

  // 4) Idempotent debit. Retries from a duplicate HTTP entry pass through
  //    `already=true` and do NOT consume another credit.
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
  let report: ResumeScreenReport | null = null;
  let primaryDone = false;

  const pStart = deps.clock.now();
  const primaryAttemptId = await deps.attempts.startAttempt(args.jobId, "primary");
  if (!primaryAttemptId) {
    await deps.jobs.markStatus(args.jobId, "primary_failed", true);
    return { kind: "primary_failed" };
  }
  await deps.jobs.markStatus(args.jobId, "primary_running", false);
  const pRes = await deps.provider.callPrimary({ jobId: args.jobId, candidateId: job.candidateId, prompt });
  if (pRes.ok) {
    const v = deps.validator.validate(pRes.reportJson);
    await deps.attempts.saveDiagnostics(primaryAttemptId, {
      chatId: pRes.chatId ?? null,
      operationPart: "resume_screen",
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
      operationPart: "resume_screen",
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
      if (!fbId) break;
      await deps.jobs.markStatus(args.jobId, "fallback_running", false);
      const f = await deps.provider.callFallback({
        jobId: args.jobId, candidateId: job.candidateId, prompt, attempt: i,
      });
      if (f.ok) {
        const v = deps.validator.validate(f.reportJson);
        await deps.attempts.saveDiagnostics(fbId, {
          chatId: f.chatId ?? null,
          operationPart: "resume_screen",
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
          operationPart: "resume_screen",
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

  // 7) Atomic stage-specific save. Existing report must be preserved if save fails.
  const saveRes = await deps.results.saveResumeEvaluation({ candidateId: job.candidateId, report });
  if (!saveRes.ok) {
    await deps.jobs.markStatus(args.jobId, "save_failed", true);
    return { kind: "save_failed", code: safe(saveRes.error || "save_failed") };
  }

  // 8) Terminal status — strict.
  const finalStatus: JobStatus = primaryDone ? "primary_succeeded" : "fallback_succeeded";
  const term = await deps.jobs.markStatus(args.jobId, finalStatus, true);
  if (!term.ok) {
    // Save succeeded, but we cannot prove a terminal success. Surface
    // save_failed instead of pretending success. The persisted row is
    // intact; client polling will see a failure and the operator can
    // verify out-of-band.
    await deps.jobs.markStatus(args.jobId, "save_failed", true);
    return { kind: "save_failed", code: safe(`status_update:${term.error || "unknown"}`) };
  }
  return { kind: "succeeded", via: primaryDone ? "primary" : "rr_pro_max", status: finalStatus };
}

export const __internal_terminal_statuses = TERMINAL;