// Background runner for long AI jobs.
//
// Goal: the HTTP request returns a job_id quickly; the actual AI work
// (with retries + optional fallback + save) continues server-side after the
// response is sent. Uses Supabase Edge `EdgeRuntime.waitUntil` when available
// and falls back to a fire-and-forget Promise so local Deno tests still work.
//
// IMPORTANT: this module does NOT charge RR. Charging is owned by the caller
// and must be keyed by job_id / request_id so retries don't double-charge.

import {
  finishAttempt,
  markJobStatus,
  markSaveFailed,
  markValidationFailed,
  startFallbackAttempt,
  startPrimaryAttempt,
} from "./ai-jobs.ts";

/** Run an async task in the background of an edge function request. */
export function runInBackground(promise: Promise<unknown>): void {
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    try {
      er.waitUntil(promise);
      return;
    } catch (e) {
      console.error("EdgeRuntime.waitUntil threw", (e as Error)?.message);
    }
  }
  // Fallback (local / test): fire-and-forget. Edge runtime SHOULD have
  // waitUntil — log so we notice if it ever silently goes missing in prod.
  console.warn("EdgeRuntime.waitUntil unavailable; running task inline (no early HTTP response)");
  promise.catch((e) => console.error("background task error", (e as Error)?.message));
}

export type AttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; safeCode: string; retryable: boolean };

export interface JobBackgroundContext<T> {
  jobId: string;
  /** Run primary side once; runner manages attempts + lifecycle around it. */
  primary: (attemptNumber: number, attemptId: string) => Promise<AttemptResult<T>>;
  /** Optional RR Pro Max fallback. Same contract as primary. */
  fallback?: (attemptNumber: number, attemptId: string) => Promise<AttemptResult<T>>;
  /** Persist final value. Return ok=false to mark job save_failed. */
  save: (value: T) => Promise<{ ok: true } | { ok: false; safeCode: string }>;
}

/**
 * Drive the full primary→fallback→save lifecycle for one AI job.
 * Status transitions handled here:
 *   primary_running → (primary_succeeded | primary_failed → fallback_available
 *                       → fallback_running → fallback_succeeded | fallback_failed)
 *                   | validation_failed | save_failed
 */
export async function runJobLifecycle<T>(ctx: JobBackgroundContext<T>): Promise<void> {
  const { jobId } = ctx;
  let value: T | null = null;
  let primaryDone = false;
  let primaryFatal: { safeCode: string } | null = null;

  // --- PRIMARY ---
  const primaryAttemptId = await startPrimaryAttempt(jobId);
  if (!primaryAttemptId) {
    await markJobStatus(jobId, "primary_failed", true);
    return;
  }
  try {
    // primary callback owns internal retries via callProTalkWithRetry.
    const r = await ctx.primary(1, primaryAttemptId);
    if (r.ok) {
      await finishAttempt(primaryAttemptId, { status: "succeeded" });
      value = r.value;
      primaryDone = true;
    } else {
      await finishAttempt(primaryAttemptId, {
        status: "failed",
        safe_error_code: r.safeCode.slice(0, 64),
      });
      if (!r.retryable) primaryFatal = { safeCode: r.safeCode };
    }
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 64);
    await finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: msg });
  }

  // --- FALLBACK (only on retryable / unknown primary failure) ---
  if (!primaryDone && ctx.fallback && !primaryFatal) {
    await markJobStatus(jobId, "primary_failed");
    await markJobStatus(jobId, "fallback_available");
    const fbAttemptId = await startFallbackAttempt(jobId);
    if (fbAttemptId) {
      try {
        const r = await ctx.fallback(2, fbAttemptId);
        if (r.ok) {
          await finishAttempt(fbAttemptId, { status: "succeeded" });
          value = r.value;
        } else {
          await finishAttempt(fbAttemptId, {
            status: "failed",
            safe_error_code: r.safeCode.slice(0, 64),
          });
        }
      } catch (e) {
        const msg = String((e as Error)?.message || e).slice(0, 64);
        await finishAttempt(fbAttemptId, { status: "failed", safe_error_code: msg });
      }
    }
  }

  if (value === null) {
    // No usable result from primary or fallback.
    // Distinguish validation_failed (schema) from generic failure via safeCode prefix.
    const code = primaryFatal?.safeCode || "ai_failed";
    if (code.startsWith("schema_invalid")) {
      await markValidationFailed(jobId, code);
    } else if (ctx.fallback) {
      await markJobStatus(jobId, "fallback_failed", true);
    } else {
      await markJobStatus(jobId, "primary_failed", true);
    }
    return;
  }

  // --- SAVE ---
  const saved = await ctx.save(value);
  if (!saved.ok) {
    await markSaveFailed(jobId, saved.safeCode);
    return;
  }
  const finalStatus = primaryDone ? "primary_succeeded" : "fallback_succeeded";
  await markJobStatus(jobId, finalStatus, true);
}

/** Convenience: wrap a thrown error / value into AttemptResult. */
export async function tryAttempt<T>(
  fn: () => Promise<T>,
  classify?: (err: unknown) => { safeCode: string; retryable: boolean },
): Promise<AttemptResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (e) {
    const cls = classify
      ? classify(e)
      : { safeCode: String((e as Error)?.message || "error").slice(0, 64), retryable: true };
    return { ok: false, ...cls };
  }
}