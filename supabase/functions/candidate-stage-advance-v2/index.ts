// =============================================================================
// candidate-stage-advance-v2  (Phase 3B-2B Step D1a-FIX-2)
//
// Server-authoritative stage advance. The endpoint accepts ONLY a job_id from
// the candidate. Every other input — candidate_id, project_id, current_stage,
// next_stage, job_type, overall_score, pass_score — is determined server-side
// by the SECURITY DEFINER RPC `advance_candidate_stage_after_ai_job_v2`.
//
// Any extra fields in the request body are silently ignored; only `job_id` is
// read. The candidate identity is taken from the verified candidate token.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { getAdminClient } from "../_shared/protalk.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.json().catch(() => null) as null | Record<string, unknown>;
  if (!raw || typeof raw !== "object") return jsonResponse({ error: "bad_body" }, 400);
  // The token may arrive in the body for environments that strip custom
  // headers. We deliberately ignore every other field.
  const tokenFromBody = typeof raw.candidate_token === "string" ? raw.candidate_token : undefined;
  const jobId = typeof raw.job_id === "string" ? raw.job_id.trim() : "";
  if (!UUID_RE.test(jobId)) return jsonResponse({ error: "bad_job_id" }, 400);

  const authz = await requireCandidateToken(req, tokenFromBody);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  const { data, error } = await admin.rpc("advance_candidate_stage_after_ai_job_v2", {
    _candidate_id: candidateId,
    _job_id: jobId,
  });
  if (error) return jsonResponse({ error: "rpc_failed" }, 500);
  return jsonResponse(data, 200);
});