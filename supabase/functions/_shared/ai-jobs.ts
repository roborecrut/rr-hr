// Helpers to manage ai_jobs lifecycle from edge functions.
// All access uses service_role (getAdminClient); RLS/grants block direct
// authenticated/anon access to the underlying tables — see migration 4a.1.
import { getAdminClient } from "./protalk.ts";

export type CreateJobInput = {
  userId: string | null;
  candidateId?: string | null;
  jobType: string;
  idempotencyKey: string;
  requestSnapshot: Record<string, unknown>;
  fallbackAllowed?: boolean;
};

export async function createOrReuseAiJob(input: CreateJobInput): Promise<{ id: string; reused: boolean } | { error: string }> {
  const admin = getAdminClient();
  if (!admin) return { error: "no_admin_client" };
  const snapshot = input.requestSnapshot;
  const hash = await sha256Hex(JSON.stringify(snapshot));
  // Try fetch existing by idempotency_key + owner.
  const ownerCol = input.userId ? "user_id" : "candidate_id";
  const ownerVal = input.userId || input.candidateId;
  if (!ownerVal) return { error: "no_owner" };
  const existing = await admin
    .from("ai_jobs")
    .select("id")
    .eq("idempotency_key", input.idempotencyKey)
    .eq(ownerCol, ownerVal)
    .maybeSingle();
  if (existing.data?.id) return { id: existing.data.id, reused: true };
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

export async function startPrimaryAttempt(jobId: string): Promise<string | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  await admin.from("ai_jobs").update({ status: "primary_running" }).eq("id", jobId);
  const ins = await admin.from("ai_job_attempts").insert({
    job_id: jobId, provider: "protalk_primary", attempt_number: 1, status: "started",
  }).select("id").single();
  return ins.data?.id || null;
}

export async function finishAttempt(
  attemptId: string,
  patch: { status: "succeeded" | "failed" | "timed_out"; safe_error_code?: string | null; result_reference?: string | null },
) {
  const admin = getAdminClient();
  if (!admin || !attemptId) return;
  await admin.from("ai_job_attempts").update({
    status: patch.status,
    safe_error_code: patch.safe_error_code ?? null,
    result_reference: patch.result_reference ?? null,
    finished_at: new Date().toISOString(),
  }).eq("id", attemptId);
}

export async function markJobStatus(jobId: string, status: string, completed = false) {
  const admin = getAdminClient();
  if (!admin) return;
  const patch: Record<string, unknown> = { status };
  if (completed) patch.completed_at = new Date().toISOString();
  await admin.from("ai_jobs").update(patch).eq("id", jobId);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}