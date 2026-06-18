/**
 * Generic frontend client for the new async AI-job architecture.
 *
 * Phase 3B-2A scope: wired ONLY to ai-interview-screen-resume-v2. Checklist
 * and situations continue to use the old synchronous path until Phase 3B-2B.
 *
 * Responsibilities:
 *   - mint a stable request_id (crypto.randomUUID) per logical user action
 *   - start the edge function and remember the active job in localStorage
 *   - poll get_ai_job_safe_status until terminal
 *   - restore an active job on page reload (no duplicate start, no re-charge)
 *   - re-poll immediately on focus / visibilitychange
 *
 * What we DO NOT store in localStorage:
 *   - resume text, AI output, employer report, candidate report,
 *     prompts, errors, scores. Only {job_id, request_id, candidate_id, created_at}.
 */
import { supabase } from "@/integrations/supabase/client";

export type AiJobStatus =
  | "created" | "primary_running" | "primary_failed"
  | "fallback_available" | "fallback_running"
  | "primary_succeeded" | "fallback_succeeded"
  | "save_failed" | "validation_failed" | "fallback_failed"
  | "fallback_unavailable" | "cancelled" | "timed_out";

const TERMINAL_STATUSES: AiJobStatus[] = [
  "primary_succeeded", "fallback_succeeded",
  "save_failed", "validation_failed", "fallback_failed",
  "fallback_unavailable", "cancelled", "timed_out",
];
const SUCCESS_STATUSES: AiJobStatus[] = ["primary_succeeded", "fallback_succeeded"];

export function isTerminal(s: string | null | undefined): boolean {
  return !!s && (TERMINAL_STATUSES as string[]).includes(s);
}
export function isSuccess(s: string | null | undefined): boolean {
  return !!s && (SUCCESS_STATUSES as string[]).includes(s);
}

export type ActiveJobRecord = {
  job_id: string;
  request_id: string;
  candidate_id: string;
  created_at: string;
};

export function activeJobKey(kind: "screen_resume", candidateId: string): string {
  return `rr_active_ai_job:${kind}:${candidateId}`;
}

export function getActiveJob(kind: "screen_resume", candidateId: string): ActiveJobRecord | null {
  try {
    const raw = localStorage.getItem(activeJobKey(kind, candidateId));
    if (!raw) return null;
    const o = JSON.parse(raw) as ActiveJobRecord;
    if (!o?.job_id || !o?.request_id) return null;
    return o;
  } catch { return null; }
}

export function setActiveJob(kind: "screen_resume", rec: ActiveJobRecord): void {
  try { localStorage.setItem(activeJobKey(kind, rec.candidate_id), JSON.stringify(rec)); }
  catch { /* ignore quota */ }
}

export function clearActiveJob(kind: "screen_resume", candidateId: string): void {
  try { localStorage.removeItem(activeJobKey(kind, candidateId)); } catch { /* ignore */ }
}

function getCandidateToken(): string | null {
  try {
    const raw = localStorage.getItem("cand_session");
    if (!raw) return null;
    return (JSON.parse(raw) as any)?.token || null;
  } catch { return null; }
}

/**
 * Start a NEW resume-screen v2 job, or reuse an existing one for the same
 * request_id. Reusing returns the same job_id without re-charging.
 */
export async function startResumeScreenV2(opts: {
  candidateId: string;
  resumeText: string;
  requestId?: string;
}): Promise<{ job_id: string; status: string; reused: boolean; terminal: boolean; request_id: string }> {
  const requestId = opts.requestId || crypto.randomUUID();
  const token = getCandidateToken();
  if (!token) throw new Error("candidate_session_missing");
  const { data, error } = await supabase.functions.invoke("ai-interview-screen-resume-v2", {
    body: {
      request_id: requestId,
      resume_text: opts.resumeText,
      async_version: 2,
      candidate_token: token,
    },
    headers: { "x-candidate-token": token },
  });
  const errCode = (data as any)?.error || (error as any)?.message;
  if (errCode) throw new Error(String(errCode));
  const d = data as { job_id: string; status: string; reused: boolean; terminal: boolean };
  if (!d?.job_id) throw new Error("no_job_id");
  setActiveJob("screen_resume", {
    job_id: d.job_id, request_id: requestId,
    candidate_id: opts.candidateId,
    created_at: new Date().toISOString(),
  });
  return { ...d, request_id: requestId };
}

export type JobStatusRow = {
  job_id: string;
  job_type: string;
  status: string;
  fallback_used: boolean;
  attempts_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export async function fetchJobStatus(jobId: string): Promise<JobStatusRow | null> {
  // Candidates have NO Supabase Auth session — only the opaque candidate
  // token in localStorage (`cand_session.token`). The RPC
  // `get_ai_job_safe_status` is GRANT'd to `authenticated`, so a direct
  // `supabase.rpc(...)` call from the candidate cabinet is rejected. Poll
  // through the dedicated edge function which validates the candidate
  // token server-side and enforces ownership without touching anon grants.
  const token = getCandidateToken();
  if (!token) return null;
  const { data, error } = await supabase.functions.invoke(
    "ai-job-status-candidate-v2",
    { body: { job_id: jobId }, headers: { "x-candidate-token": token } },
  );
  if (error) return null;
  const d = data as any;
  if (!d?.ok) return null;
  return {
    job_id: d.job_id,
    job_type: d.job_type,
    status: d.status,
    fallback_used: !!d.fallback_used,
    attempts_count: d.attempts_count || 0,
    created_at: d.created_at,
    updated_at: d.updated_at,
    completed_at: d.finished_at ?? null,
  };
}

/**
 * Poll a job until terminal. Calls onTick(status) on every change. Returns
 * the final status row. Listens for focus / visibilitychange and forces an
 * immediate poll on those events. Caller owns the abort signal.
 */
export async function pollJobUntilTerminal(opts: {
  jobId: string;
  signal?: AbortSignal;
  onTick?: (row: JobStatusRow) => void;
  maxMs?: number;
}): Promise<JobStatusRow> {
  const startedAt = Date.now();
  const maxMs = opts.maxMs ?? 10 * 60_000; // 10 min hard cap
  let lastStatus = "";
  let delay = 2000;
  const wakeups: Array<() => void> = [];
  const wake = () => { const f = wakeups.shift(); if (f) f(); };
  const onFocus = () => wake();
  const onVis = () => { if (document.visibilityState === "visible") wake(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVis);
  try {
    while (true) {
      if (opts.signal?.aborted) throw new Error("aborted");
      if (Date.now() - startedAt > maxMs) throw new Error("client_poll_timeout");
      const row = await fetchJobStatus(opts.jobId);
      if (row) {
        if (row.status !== lastStatus) {
          lastStatus = row.status;
          opts.onTick?.(row);
        }
        if (isTerminal(row.status)) return row;
      }
      // sleep with focus-wakeup
      await new Promise<void>((resolve) => {
        const id = setTimeout(resolve, delay);
        wakeups.push(() => { clearTimeout(id); resolve(); });
      });
      delay = Math.min(delay * 1.5, 8000);
    }
  } finally {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVis);
  }
}
