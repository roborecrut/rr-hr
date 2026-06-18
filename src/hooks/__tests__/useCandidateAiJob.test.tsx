/**
 * Phase 3B-2B Step D1a — useCandidateAiJob hook tests.
 * All network and storage is injected via deps; no real Supabase, no real
 * AI calls, no real timers (manual scheduling).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCandidateAiJob, type HookDeps } from "@/hooks/useCandidateAiJob";
import type { ActiveJobRecord, JobStatusRow } from "@/lib/aiJobs";

type FakeStorage = Map<string, ActiveJobRecord>;

function makeDeps(opts: {
  storage: FakeStorage;
  startChecklist?: HookDeps["startChecklist"];
  startSituations?: HookDeps["startSituations"];
  statusSequence?: Array<JobStatusRow | null>;
  onStatusCall?: () => void;
}): { deps: Partial<HookDeps>; runNextTimer: () => Promise<void>; calls: { status: number; checklist: number; situations: number } } {
  const calls = { status: 0, checklist: 0, situations: 0 };
  let timers: Array<() => void> = [];
  const seq = [...(opts.statusSequence || [])];

  const deps: Partial<HookDeps> = {
    readActive: (k, c) => opts.storage.get(`${k}:${c}`) || null,
    clearActive: (k, c) => { opts.storage.delete(`${k}:${c}`); },
    setTimer: (fn, _ms) => { timers.push(fn as () => void); return timers.length; },
    clearTimer: (_h) => { /* tests advance via runNextTimer */ },
    addFocus: () => () => {},
    addVisibility: () => () => {},
    pollStatus: async (_id: string) => {
      calls.status++;
      opts.onStatusCall?.();
      const row = seq.shift();
      return row === undefined ? null : row;
    },
    startChecklist: opts.startChecklist || (async ({ candidateId }) => {
      calls.checklist++;
      const r = { job_id: "job-CL", request_id: "req-CL", status: "primary_running", reused: false, terminal: false };
      opts.storage.set(`checklist_grade:${candidateId}`, { job_id: r.job_id, request_id: r.request_id, candidate_id: candidateId, created_at: "x" });
      return r;
    }),
    startSituations: opts.startSituations || (async ({ candidateId }) => {
      calls.situations++;
      const r = { job_id: "job-S", request_id: "req-S", status: "primary_running", reused: false, terminal: false };
      opts.storage.set(`situations_grade:${candidateId}`, { job_id: r.job_id, request_id: r.request_id, candidate_id: candidateId, created_at: "x" });
      return r;
    }),
  };

  const runNextTimer = async () => {
    const fn = timers.shift();
    if (fn) { await act(async () => { fn(); await Promise.resolve(); await Promise.resolve(); }); }
  };
  return { deps, runNextTimer, calls };
}

const row = (status: string, jobId = "job-CL"): JobStatusRow => ({
  job_id: jobId, job_type: "grade_checklist_v2", status,
  fallback_used: false, attempts_count: 0,
  created_at: "", updated_at: "", completed_at: null,
});

beforeEach(() => { /* fresh state per test */ });

describe("useCandidateAiJob — checklist v2", () => {
  it("start creates one job and stores active record (single request_id)", async () => {
    const storage = new Map();
    const { deps, runNextTimer, calls } = makeDeps({
      storage, statusSequence: [row("primary_succeeded")],
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "cand-1", onSuccess, deps,
    }));
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    await runNextTimer();
    expect(calls.checklist).toBe(1);
    expect(result.current.state).toBe("succeeded");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(storage.has("checklist_grade:cand-1")).toBe(false); // cleared on terminal success
  });

  it("double-click triggers start exactly once (in-memory lock)", async () => {
    const storage = new Map();
    let resolveStart!: (v: any) => void;
    const slow = new Promise<any>((res) => { resolveStart = res; });
    const { deps, calls } = makeDeps({
      storage,
      startChecklist: async () => { calls.checklist++; return await slow; },
    });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "c2", deps,
    }));
    await act(async () => {
      // Fire two starts concurrently (simulates a double-click).
      void result.current.start({ kind: "checklist_grade", answers: { q1: "a" } });
      void result.current.start({ kind: "checklist_grade", answers: { q1: "a" } });
      await Promise.resolve();
    });
    expect(calls.checklist).toBe(1);
    await act(async () => {
      resolveStart({ job_id: "j", request_id: "r", status: "primary_running", reused: false, terminal: false });
      await Promise.resolve();
    });
  });

  it("active job blocks new start (no second request_id)", async () => {
    const storage = new Map<string, ActiveJobRecord>([
      ["checklist_grade:c3", { job_id: "existing", request_id: "old", candidate_id: "c3", created_at: "" }],
    ]);
    const { deps, calls } = makeDeps({ storage, statusSequence: [row("primary_running", "existing")] });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "c3", deps,
    }));
    // Mount restored polling; explicit start should not call startChecklist again.
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    expect(calls.checklist).toBe(0);
    expect(result.current.jobId).toBe("existing");
  });

  it("reload restores polling without creating a new request_id", async () => {
    const storage = new Map<string, ActiveJobRecord>([
      ["checklist_grade:c4", { job_id: "j-rl", request_id: "rid-rl", candidate_id: "c4", created_at: "" }],
    ]);
    const { deps, runNextTimer, calls } = makeDeps({
      storage, statusSequence: [row("primary_running", "j-rl"), row("primary_succeeded", "j-rl")],
    });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "c4", deps,
    }));
    expect(result.current.jobId).toBe("j-rl");
    expect(result.current.state).toBe("running");
    await runNextTimer(); // primary_running
    await runNextTimer(); // primary_succeeded
    expect(result.current.state).toBe("succeeded");
    expect(calls.checklist).toBe(0);
  });

  it("primary_failed does NOT clear localStorage and continues polling", async () => {
    const storage = new Map();
    const { deps, runNextTimer } = makeDeps({
      storage,
      statusSequence: [row("primary_failed"), row("fallback_running"), row("fallback_succeeded")],
    });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "cf", deps,
    }));
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    await runNextTimer();
    expect(storage.has("checklist_grade:cf")).toBe(true);
    expect(result.current.state).toBe("running");
    await runNextTimer();
    expect(result.current.state).toBe("fallback_running");
    await runNextTimer();
    expect(result.current.state).toBe("succeeded");
    expect(storage.has("checklist_grade:cf")).toBe(false);
  });

  it("orchestration_failed clears localStorage and surfaces RU error", async () => {
    const storage = new Map();
    const onFail = vi.fn();
    const { deps, runNextTimer } = makeDeps({
      storage, statusSequence: [row("orchestration_failed")],
    });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "co", onFailure: onFail, deps,
    }));
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    await runNextTimer();
    expect(result.current.state).toBe("failed");
    expect(result.current.errorCode).toBe("orchestration_failed");
    expect(result.current.errorMessage).toMatch(/техническ/);
    expect(storage.has("checklist_grade:co")).toBe(false);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("reused terminal success fires onSuccess once (no double stage advance)", async () => {
    const storage = new Map();
    const startReused: HookDeps["startChecklist"] = async ({ candidateId }) => {
      const r = { job_id: "reused", request_id: "rid", status: "primary_succeeded", reused: true, terminal: true };
      storage.set(`checklist_grade:${candidateId}`, { job_id: r.job_id, request_id: r.request_id, candidate_id: candidateId, created_at: "" });
      return r;
    };
    const onSuccess = vi.fn();
    const { deps } = makeDeps({ storage, startChecklist: startReused });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "cr", onSuccess, deps,
    }));
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    expect(result.current.state).toBe("succeeded");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Second start with same active job must NOT re-fire onSuccess
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels pending callbacks (late response ignored)", async () => {
    const storage = new Map();
    let resolveLate!: (v: JobStatusRow | null) => void;
    const deps: Partial<HookDeps> = {
      readActive: () => null,
      clearActive: () => {},
      setTimer: (fn) => { setTimeout(fn as () => void, 0); return 1; },
      clearTimer: () => {},
      addFocus: () => () => {},
      addVisibility: () => () => {},
      pollStatus: () => new Promise((res) => { resolveLate = res; }),
      startChecklist: async () => ({ job_id: "j", request_id: "r", status: "primary_running", reused: false, terminal: false }),
    };
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() => useCandidateAiJob({
      kind: "checklist_grade", candidateId: "cu", onSuccess, deps,
    }));
    await act(async () => { await result.current.start({ kind: "checklist_grade", answers: { q1: "a" } }); });
    // Let the scheduled tick fire so pollStatus is invoked and resolveLate
    // is assigned. Without this, unmount races the macrotask scheduler.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    unmount();
    // Late terminal-success response must not fire onSuccess on an unmounted hook.
    resolveLate(row("primary_succeeded", "j"));
    await new Promise((r) => setTimeout(r, 10));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("useCandidateAiJob — situations v2 (kind parity)", () => {
  it("situations start uses situations endpoint, single request_id", async () => {
    const storage = new Map();
    const { deps, calls, runNextTimer } = makeDeps({
      storage, statusSequence: [row("primary_succeeded", "job-S")],
    });
    const { result } = renderHook(() => useCandidateAiJob({
      kind: "situations_grade", candidateId: "s1", deps,
    }));
    await act(async () => { await result.current.start({ kind: "situations_grade", answers: { s1: "a" } }); });
    await runNextTimer();
    expect(calls.situations).toBe(1);
    expect(calls.checklist).toBe(0);
    expect(result.current.state).toBe("succeeded");
  });
});