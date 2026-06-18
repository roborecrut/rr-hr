// =============================================================================
// ai-job-status-candidate-v2
//
// Safe candidate-side polling endpoint for the v2 async AI-job lifecycle.
//
// Why this exists:
//   Candidates DO NOT have a Supabase Auth session. They authenticate via the
//   opaque `x-candidate-token` header backed by `candidate_sessions`. The RPC
//   `get_ai_job_safe_status(uuid)` is GRANT'd only to `authenticated` /
//   `service_role`, so a direct `supabase.rpc(...)` call from the candidate
//   cabinet is rejected (no `auth.uid()`). This function bridges that gap
//   without weakening the RPC's RLS posture or exposing it to `anon`.
//
// Contract:
//   POST { job_id: uuid }
//   Header: x-candidate-token  (or body.candidate_token)
//
// Response (200):
//   { ok:true, job_id, status, job_type, fallback_used, attempts_count,
//     created_at, updated_at, finished_at }
//
// Errors:
//   400 bad_body | bad_job_id
//   401 candidate_token_required | bad_token
//   403 forbidden        (job exists but does not belong to this candidate)
//   404 not_found
//   500 internal
//
// What this function NEVER returns:
//   - request_snapshot / resume_text / prompt / AI response
//   - employer report / candidate report (those come via separate
//     candidate_scores reads governed by RLS)
//   - provider secrets, raw error messages with PII
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { getAdminClient } from "../_shared/protalk.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    job_id?: string;
    candidate_token?: string;
  };
  if (!body) return jsonResponse({ error: "bad_body" }, 400);
  const jobId = String(body.job_id || "").trim();
  if (!UUID_RE.test(jobId)) return jsonResponse({ error: "bad_job_id" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  // 1) Load minimal job row via service_role and verify ownership server-side.
  //    We DO NOT call get_ai_job_safe_status RPC here because we already have
  //    service_role; reading the table directly avoids an unnecessary hop and
  //    keeps the RPC available for the (future) employer-side authenticated
  //    flow without re-granting it to anon.
  const { data: job, error: jobErr } = await admin
    .from("ai_jobs")
    .select("id, candidate_id, job_type, status, fallback_used, created_at, updated_at, completed_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) return jsonResponse({ error: "internal" }, 500);
  if (!job) return jsonResponse({ error: "not_found" }, 404);
  if ((job as any).candidate_id !== candidateId) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  // 2) attempts_count: cheap aggregate, no payload exposure.
  const { count: attemptsCount } = await admin
    .from("ai_job_attempts")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  return jsonResponse({
    ok: true,
    job_id: (job as any).id,
    job_type: (job as any).job_type,
    status: (job as any).status,
    fallback_used: !!(job as any).fallback_used,
    attempts_count: attemptsCount || 0,
    created_at: (job as any).created_at,
    updated_at: (job as any).updated_at,
    finished_at: (job as any).completed_at,
  });
});