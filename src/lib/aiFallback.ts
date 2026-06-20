// =============================================================================
// Frontend gateway for the RR Pro Max fallback (Wave 2 §3).
//
// When an async AI-job hits a terminal failure caused by the primary provider
// (`primary_failed`, `fallback_available`, `validation_failed`,
// `fallback_unavailable`, `timed_out`, `orchestration_failed`, ...), the UI
// surfaces an overlay offering one retry on the RR Pro Max backup provider.
//
// This module is transport-only: it exposes
//   - `isFallbackEligible(code)`     — does this terminal status warrant the
//                                       overlay?
//   - `invokeFallback({ job_id })`    — calls the `ai-fallback-rr-pro-max`
//                                       edge function as the current user OR
//                                       candidate (passes `x-candidate-token`
//                                       when the session has no Supabase auth).
//   - a tiny pub/sub store + `openAIFallback`/`closeAIFallback` so any feature
//     that owns an AI job can request the gate without prop-drilling.
//
// All RR-charging is skipped server-side (see `ai-fallback-rr-pro-max/index.ts`).
// The frontend never re-sends the original prompt — only the job_id.
// =============================================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Terminal statuses where Pro Max is allowed to take over. */
const ELIGIBLE_CODES = new Set<string>([
  "primary_failed",
  "fallback_available",
  "validation_failed",
  "fallback_unavailable",
  "timed_out",
  "orchestration_failed",
  "empty_response",
  "schema_invalid",
  "save_failed",
]);

export function isFallbackEligible(code: string | null | undefined): boolean {
  if (!code) return false;
  return ELIGIBLE_CODES.has(code);
}

function readCandidateToken(): string | null {
  try {
    const raw = localStorage.getItem("cand_session");
    if (!raw) return null;
    return (JSON.parse(raw) as any)?.token || null;
  } catch { return null; }
}

export type FallbackResult =
  | { ok: true; data: any }
  | { ok: false; code: string };

/**
 * Call the fallback edge function for an existing job_id. The server reads the
 * private request_snapshot — we never re-send the prompt from the browser.
 */
export async function invokeFallback(jobId: string): Promise<FallbackResult> {
  if (!jobId) return { ok: false, code: "no_job_id" };
  const candidateToken = readCandidateToken();
  const headers: Record<string, string> = {};
  if (candidateToken) headers["x-candidate-token"] = candidateToken;
  try {
    const { data, error } = await supabase.functions.invoke("ai-fallback-rr-pro-max", {
      body: { job_id: jobId },
      headers: Object.keys(headers).length ? headers : undefined,
    });
    if (error) {
      // supabase-js wraps non-2xx as FunctionsHttpError. Try to pull the
      // safe `error` code from the JSON body.
      let code = "fallback_invoke_failed";
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          const j = await ctx.json();
          if (j?.error) code = String(j.error);
        }
      } catch { /* ignore */ }
      return { ok: false, code };
    }
    if (data && typeof data === "object" && "error" in data && (data as any).error) {
      return { ok: false, code: String((data as any).error) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, code: (e as Error)?.message || "fallback_invoke_failed" };
  }
}

// ---- tiny pub/sub store for the global gate -------------------------------

export type FallbackPhase = "offer" | "running" | "failed" | "succeeded";

export type FallbackGateState = {
  open: boolean;
  phase: FallbackPhase;
  jobId: string | null;
  /** Initial trigger code (what failed in the primary path). */
  triggerCode: string | null;
  /** Last fallback error code (only meaningful when phase === 'failed'). */
  errorCode: string | null;
  /** Called after a successful fallback so the host can refetch the result. */
  onSuccess?: (data: any) => void | Promise<void>;
  /** Called when the user dismisses the gate without resolving. */
  onDismiss?: () => void;
};

const INITIAL: FallbackGateState = {
  open: false, phase: "offer", jobId: null, triggerCode: null, errorCode: null,
};

let state: FallbackGateState = { ...INITIAL };
const listeners = new Set<(s: FallbackGateState) => void>();

function emit() {
  for (const l of listeners) l(state);
}

export function openAIFallback(opts: {
  jobId: string;
  triggerCode: string;
  onSuccess?: (data: any) => void | Promise<void>;
  onDismiss?: () => void;
}): void {
  if (!opts.jobId || !isFallbackEligible(opts.triggerCode)) return;
  state = {
    open: true,
    phase: "offer",
    jobId: opts.jobId,
    triggerCode: opts.triggerCode,
    errorCode: null,
    onSuccess: opts.onSuccess,
    onDismiss: opts.onDismiss,
  };
  emit();
}

export function closeAIFallback(reason: "dismiss" | "success" = "dismiss"): void {
  const prev = state;
  state = { ...INITIAL };
  emit();
  if (reason === "dismiss") {
    try { prev.onDismiss?.(); } catch { /* ignore */ }
  }
}

/** Internal — drive the request lifecycle from inside the gate component. */
export async function _runFallbackForGate(): Promise<void> {
  if (!state.open || !state.jobId) return;
  state = { ...state, phase: "running", errorCode: null };
  emit();
  const res = await invokeFallback(state.jobId);
  if (res.ok) {
    const onSuccess = state.onSuccess;
    state = { ...state, phase: "succeeded" };
    emit();
    try { await onSuccess?.(res.data); } catch { /* host handles its own toast */ }
    // Auto-close after a brief success flash so the host can re-render.
    setTimeout(() => {
      if (state.phase === "succeeded") closeAIFallback("success");
    }, 900);
  } else {
    state = { ...state, phase: "failed", errorCode: res.code };
    emit();
  }
}

export function useAIFallbackGate(): FallbackGateState {
  const [s, setS] = useState<FallbackGateState>(state);
  useEffect(() => {
    const l = (next: FallbackGateState) => setS(next);
    listeners.add(l);
    setS(state);
    return () => { listeners.delete(l); };
  }, []);
  return s;
}

export const SUPPORT_TELEGRAM_URL = "https://t.me/+Qr9hu50w7tEwNjZi";