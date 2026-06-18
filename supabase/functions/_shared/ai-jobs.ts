// Helpers to manage ai_jobs lifecycle from edge functions.
// All access uses service_role (getAdminClient); RLS/grants block direct
// authenticated/anon access to the underlying tables — see migration 4a.1.
import { getAdminClient } from "./protalk.ts";

// Canonical JSON: keys recursively sorted, arrays preserved. Stable across
// Postgres jsonb round-trip (which reorders object keys) so hash equality
// holds for the same logical payload.
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJsonStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify((value as any)[k])).join(",") + "}";
}

export type CreateJobInput = {
  userId: string | null;
  candidateId?: string | null;
  jobType: string;
  idempotencyKey: string;
  requestSnapshot: Record<string, unknown>;
  fallbackAllowed?: boolean;
};

/** Statuses that mean the job is over for good — must NOT be reused / restarted. */
const TERMINAL_STATUSES = new Set([
  "primary_succeeded",
  "fallback_succeeded",
  "cancelled",
  "timed_out",
  "save_failed",
  "validation_failed",
  "fallback_failed",
]);

export async function createOrReuseAiJob(input: CreateJobInput): Promise<{ id: string; reused: boolean; status?: string } | { error: string }> {
  const admin = getAdminClient();
  if (!admin) return { error: "no_admin_client" };
  const snapshot = input.requestSnapshot;
  const hash = await sha256Hex(canonicalJsonStringify(snapshot));
  // Try fetch existing by idempotency_key + owner.
  const ownerCol = input.userId ? "user_id" : "candidate_id";
  const ownerVal = input.userId || input.candidateId;
  if (!ownerVal) return { error: "no_owner" };
  const existing = await admin
    .from("ai_jobs")
    .select("id,status")
    .eq("idempotency_key", input.idempotencyKey)
    .eq(ownerCol, ownerVal)
    .maybeSingle();
  if (existing.error) return { error: existing.error.message };
  if (existing.data?.id) {
    // Only reuse non-terminal jobs. Terminal jobs are sealed; a new explicit
    // request_id from the client will produce a fresh idempotency_key and
    // therefore a brand-new job here.
    const st = String(existing.data.status || "");
    if (!TERMINAL_STATUSES.has(st)) {
      return { id: existing.data.id, reused: true, status: st };
    }
    // If client somehow reuses an idempotency key after terminal status, do
    // not reanimate — return error so caller can surface a clear message.
    return { error: `terminal_job_exists:${st}` };
  }
  const ins = await admin.from("ai_jobs").insert({
    user_id: input.userId,
    candidate_id: input.candidateId || null,
    job_type: input.jobType,
    status: "created",
    fallback_allowed: input.fallbackAllowed !== false,
    fallback_used: false,
    credits_status: "not_charged",
    idempotency_key: input.idempotencyKey,
    request_snapshot: snapshot,
    request_hash: hash,
  }).select("id").single();
  if (ins.error || !ins.data) return { error: ins.error?.message || "insert_failed" };
  return { id: ins.data.id, reused: false };
}

/**
 * Atomic primary attempt start. Uses SECURITY DEFINER RPC `start_ai_job_attempt`
 * which locks the ai_jobs row, refuses a second active attempt of the same
 * provider, and computes the next attempt_number across all providers.
 *
 * Signature preserved (string | null) for backward-compat with existing edge
 * functions. The richer info is available via `startAttempt({ provider })`.
 */
export async function startPrimaryAttempt(jobId: string): Promise<string | null> {
  const r = await startAttempt(jobId, "primary", { jobStatus: "primary_running" });
  return r?.attemptId ?? null;
}

export async function startFallbackAttempt(jobId: string): Promise<string | null> {
  const r = await startAttempt(jobId, "rr_pro_max", {
    jobStatus: "fallback_running",
    extraJobPatch: { fallback_used: true },
  });
  return r?.attemptId ?? null;
}

export async function startAttempt(
  jobId: string,
  provider: "primary" | "rr_pro_max",
  opts: { jobStatus?: string; extraJobPatch?: Record<string, unknown> } = {},
): Promise<{ attemptId: string; attemptNumber: number } | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  if (opts.jobStatus) {
    const patch: Record<string, unknown> = { status: opts.jobStatus, ...(opts.extraJobPatch || {}) };
    const upd = await admin.from("ai_jobs").update(patch).eq("id", jobId);
    if (upd.error) {
      console.error("startAttempt: ai_jobs status update failed", upd.error.message, { jobId, provider });
      return null;
    }
  }
  const { data, error } = await admin.rpc("start_ai_job_attempt", { _job_id: jobId, _provider: provider });
  if (error) {
    console.error("startAttempt: RPC failed", error.message, { jobId, provider });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.attempt_id) {
    console.error("startAttempt: no attempt returned", { jobId, provider });
    return null;
  }
  return { attemptId: row.attempt_id as string, attemptNumber: row.attempt_number as number };
}

export async function finishAttempt(
  attemptId: string,
  patch: { status: "succeeded" | "failed" | "timed_out"; safe_error_code?: string | null; result_reference?: string | null },
) {
  const admin = getAdminClient();
  if (!admin || !attemptId) return;
  const upd: Record<string, unknown> = {
    status: patch.status,
    safe_error_code: patch.safe_error_code ?? null,
    completed_at: new Date().toISOString(),
  };
  const r = await admin.from("ai_job_attempts").update(upd).eq("id", attemptId);
  if (r.error) console.error("finishAttempt update failed", r.error.message);
}

export async function markJobStatus(jobId: string, status: string, completed = false) {
  const admin = getAdminClient();
  if (!admin) return;
  const patch: Record<string, unknown> = { status };
  if (completed) patch.completed_at = new Date().toISOString();
  const r = await admin.from("ai_jobs").update(patch).eq("id", jobId);
  if (r.error) console.error("markJobStatus update failed", r.error.message, { jobId, status });
}

/** Mark job as save_failed without losing existing successful generation. */
export async function markSaveFailed(jobId: string, _safeCode: string) {
  await markJobStatus(jobId, "save_failed", true);
}

/** Mark job as validation_failed when AI output (and repair) cannot satisfy schema. */
export async function markValidationFailed(jobId: string, _safeCode: string) {
  await markJobStatus(jobId, "validation_failed", true);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}