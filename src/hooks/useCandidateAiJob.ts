// =============================================================================
// useCandidateAiJob — Phase 3B-2B Step D1a.
//
// Generic candidate-side async AI-job driver for checklist_grade and
// situations_grade (resume_screen keeps its existing wiring untouched in this
// pass). Handles:
//   - active-job localStorage lookup on mount (reload recovery)
//   - in-memory ref-lock against double-click start
//   - single polling loop (no overlapping fetches)
//   - immediate focus / visibilitychange wake-up
//   - terminal cleanup of localStorage
//   - safe candidate-side error messages via describeJobError
//   - dependency injection for tests: startFn / pollFn / clearFn / clock /
//     refetch / advanceStage are all replaceable
//
// Hook NEVER stores: answers, candidate token, AI feedback, scores, project
// data. Only {job_id, request_id, candidate_id, created_at} via aiJobs helpers.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AiJobKind, type ActiveJobRecord, type JobStatusRow,
  activeJobKey, getActiveJob, clearActiveJob,
  isTerminal, isSuccess, fetchJobStatus,
  startChecklistGradeV2, startSituationsGradeV2,
} from "@/lib/aiJobs";
import { describeJobError } from "@/lib/feedbackAdapters";

export type AiJobUiState =
  | "idle" | "starting" | "running" | "fallback_running"
  | "succeeded" | "failed";

export type StartArgs =
  | { kind: "checklist_grade"; answers: Record<string, string> }
  | { kind: "situations_grade"; answers: Record<string, string> };

export type UseCandidateAiJobOptions = {
  kind: AiJobKind;
  candidateId: string;
  /** Called on terminal success. Used to refetch DB row and surface fresh data. */
  onSuccess?: (jobId: string) => Promise<void> | void;
  /** Called on terminal failure with the safe code and a Russian message. */
  onFailure?: (info: { code: string; message: string; jobId: string }) => void;
  /** Test-only DI overrides. */
  deps?: Partial<HookDeps>;
};

export type HookDeps = {
  startChecklist(args: { candidateId: string; answers: Record<string, string> }): Promise<{ job_id: string; request_id: string; status: string; reused: boolean; terminal: boolean }>;
  startSituations(args: { candidateId: string; answers: Record<string, string> }): Promise<{ job_id: string; request_id: string; status: string; reused: boolean; terminal: boolean }>;
  pollStatus(jobId: string): Promise<JobStatusRow | null>;
  readActive(kind: AiJobKind, candidateId: string): ActiveJobRecord | null;
  clearActive(kind: AiJobKind, candidateId: string): void;
  /** Schedulers — overridden in tests using fake timers. */
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Browser event hooks — overridden in tests. */
  addFocus(fn: () => void): () => void;
  addVisibility(fn: () => void): () => void;
};

const DEFAULT_DEPS: HookDeps = {
  startChecklist: (a) => startChecklistGradeV2(a),
  startSituations: (a) => startSituationsGradeV2(a),
  pollStatus: (id) => fetchJobStatus(id),
  readActive: (k, c) => getActiveJob(k, c),
  clearActive: (k, c) => clearActiveJob(k, c),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  addFocus: (fn) => {
    const on = () => fn();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  },
  addVisibility: (fn) => {
    const on = () => { if (document.visibilityState === "visible") fn(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  },
};

function nextDelay(curr: number): number {
  if (curr < 2_000) return 2_000;
  if (curr < 4_000) return 4_000;
  return Math.min(curr * 1.25, 8_000);
}

function statusToUi(s: string | null): AiJobUiState {
  if (!s) return "idle";
  if (isSuccess(s)) return "succeeded";
  if (isTerminal(s)) return "failed";
  if (s === "fallback_running" || s === "fallback_available") return "fallback_running";
  if (s === "primary_running" || s === "primary_failed" || s === "created" || s === "queued") return "running";
  return "running";
}

export type UseCandidateAiJobReturn = {
  state: AiJobUiState;
  status: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** Start a new job. If an active job exists, this is a no-op. */
  start(args: StartArgs): Promise<void>;
  /** Manual reset after the user dismisses a terminal failure. */
  reset(): void;
};

export function useCandidateAiJob(opts: UseCandidateAiJobOptions): UseCandidateAiJobReturn {
  const deps: HookDeps = { ...DEFAULT_DEPS, ...(opts.deps || {}) };
  const [state, setState] = useState<AiJobUiState>("idle");
  const [status, setStatusStr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs survive re-renders, guarantee one polling loop, and let async
  // callbacks check whether the component is still mounted.
  const mountedRef = useRef(true);
  const pollingRef = useRef(false);          // a poll loop is live
  const inflightRef = useRef(false);         // a fetchStatus is in flight
  const timerRef = useRef<unknown>(null);
  const startLockRef = useRef(false);
  const onSuccessFiredRef = useRef<Set<string>>(new Set());

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) { deps.clearTimer(timerRef.current); timerRef.current = null; }
  }, [deps]);

  const handleTerminal = useCallback(async (row: JobStatusRow) => {
    if (!mountedRef.current) return;
    setStatusStr(row.status);
    setJobId(row.job_id);
    if (isSuccess(row.status)) {
      setState("succeeded");
      setErrorCode(null); setErrorMessage(null);
      deps.clearActive(opts.kind, opts.candidateId);
      // Fire onSuccess only once per jobId — protects against reused
      // terminal jobs re-triggering side effects (e.g. stage advance).
      if (!onSuccessFiredRef.current.has(row.job_id)) {
        onSuccessFiredRef.current.add(row.job_id);
        try { await opts.onSuccess?.(row.job_id); } catch { /* swallow — UI shows refetched data */ }
      }
    } else {
      setState("failed");
      const code = row.status || "orchestration_failed";
      const msg = describeJobError(code);
      setErrorCode(code); setErrorMessage(msg);
      deps.clearActive(opts.kind, opts.candidateId);
      opts.onFailure?.({ code, message: msg, jobId: row.job_id });
    }
  }, [deps, opts]);

  const pollOnce = useCallback(async (id: string): Promise<boolean> => {
    if (inflightRef.current) return false;
    inflightRef.current = true;
    try {
      const row = await deps.pollStatus(id);
      if (!mountedRef.current) return true; // ignore late response
      if (!row) return false;
      setStatusStr(row.status);
      setJobId(row.job_id);
      if (row.status === "fallback_running" || row.status === "fallback_available") {
        setState("fallback_running");
      } else if (!isTerminal(row.status)) {
        setState("running");
      }
      if (isTerminal(row.status)) { await handleTerminal(row); return true; }
      return false;
    } finally {
      inflightRef.current = false;
    }
  }, [deps, handleTerminal]);

  const startPolling = useCallback((id: string) => {
    if (pollingRef.current) return; // single loop guard
    pollingRef.current = true;
    let delay = 2_000;
    const tick = async () => {
      if (!mountedRef.current) { pollingRef.current = false; return; }
      const done = await pollOnce(id);
      if (!mountedRef.current) { pollingRef.current = false; return; }
      if (done) { pollingRef.current = false; clearTimer(); return; }
      delay = nextDelay(delay);
      timerRef.current = deps.setTimer(tick, delay);
    };
    // First check fires immediately (the start endpoint may have returned
    // a job that is already terminal due to reuse).
    timerRef.current = deps.setTimer(tick, 0);
  }, [deps, pollOnce, clearTimer]);

  // Mount: restore active job from localStorage and resume polling.
  useEffect(() => {
    mountedRef.current = true;
    const active = deps.readActive(opts.kind, opts.candidateId);
    if (active?.job_id) {
      setJobId(active.job_id); setState("running");
      startPolling(active.job_id);
    }
    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.candidateId, opts.kind]);

  // Focus + visibility — immediate status check, never a parallel fetch.
  useEffect(() => {
    const wake = () => {
      const id = jobId; if (!id) return;
      if (!pollingRef.current) return;
      // pollOnce is guarded by inflightRef; safe to invoke concurrently with
      // the scheduled tick.
      void pollOnce(id);
    };
    const offF = deps.addFocus(wake);
    const offV = deps.addVisibility(wake);
    return () => { offF(); offV(); };
  }, [deps, jobId, pollOnce]);

  const start = useCallback(async (args: StartArgs) => {
    if (startLockRef.current) return;
    // Reuse existing active job — never spawn a duplicate request_id.
    const existing = deps.readActive(opts.kind, opts.candidateId);
    if (existing?.job_id) {
      setJobId(existing.job_id); setState("running");
      startPolling(existing.job_id);
      return;
    }
    startLockRef.current = true;
    setState("starting");
    setErrorCode(null); setErrorMessage(null);
    try {
      const res = args.kind === "checklist_grade"
        ? await deps.startChecklist({ candidateId: opts.candidateId, answers: args.answers })
        : await deps.startSituations({ candidateId: opts.candidateId, answers: args.answers });
      if (!mountedRef.current) return;
      setJobId(res.job_id); setStatusStr(res.status);
      if (res.terminal) {
        // Reused terminal job — synthesise a status row and fire terminal logic
        // without another network round-trip.
        await handleTerminal({
          job_id: res.job_id, job_type: opts.kind, status: res.status,
          fallback_used: false, attempts_count: 0,
          created_at: "", updated_at: "", completed_at: null,
        });
        return;
      }
      setState("running");
      startPolling(res.job_id);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const raw = (e as Error)?.message || "orchestration_failed";
      // Map known safe edge-function error codes to friendly RU text; never
      // surface raw SQL/internal text.
      const safe = /^[a-z0-9_:-]{1,64}$/i.test(raw) ? raw : "orchestration_failed";
      setState("failed"); setErrorCode(safe); setErrorMessage(describeJobError(safe));
      opts.onFailure?.({ code: safe, message: describeJobError(safe), jobId: "" });
    } finally {
      startLockRef.current = false;
    }
  }, [deps, opts, handleTerminal, startPolling]);

  const reset = useCallback(() => {
    deps.clearActive(opts.kind, opts.candidateId);
    clearTimer();
    pollingRef.current = false;
    setState("idle"); setStatusStr(null); setJobId(null);
    setErrorCode(null); setErrorMessage(null);
  }, [deps, opts.candidateId, opts.kind, clearTimer]);

  return { state, status, jobId, errorCode, errorMessage, start, reset };
}

// Export the localStorage key helper for tests that need to assert payload
// shape directly.
export { activeJobKey };