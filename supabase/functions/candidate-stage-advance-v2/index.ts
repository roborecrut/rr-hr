// =============================================================================
// candidate-stage-advance-v2  (Phase 3B-2B Step D1a)
//
// Thin candidate-authenticated bridge to the SECURITY DEFINER RPC
// `advance_candidate_stage_after_ai_job`. Candidates have no Supabase Auth
// session, so the SDK cannot invoke the RPC directly. This endpoint:
//   1. validates `x-candidate-token`
//   2. forwards (candidate_id from session, job_id, expected, next, job_type)
//      to the RPC — candidate_id from the body is IGNORED so a malicious
//      caller cannot advance someone else's stage
//   3. returns the RPC outcome unchanged (already / advanced / conflict /
//      forbidden / job_not_succeeded)
//
// Repeat calls are safe — the RPC itself is idempotent.
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
    expected_current_stage?: string | null;
    next_stage?: string;
    job_type?: string;
    candidate_token?: string;
  };
  if (!body) return jsonResponse({ error: "bad_body" }, 400);
  const jobId = String(body.job_id || "").trim();
  const nextStage = String(body.next_stage || "").trim();
  const jobType = String(body.job_type || "").trim();
  if (!UUID_RE.test(jobId)) return jsonResponse({ error: "bad_job_id" }, 400);
  if (!nextStage || nextStage.length > 64) return jsonResponse({ error: "bad_next_stage" }, 400);
  if (!jobType || jobType.length > 64) return jsonResponse({ error: "bad_job_type" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  const { data, error } = await admin.rpc("advance_candidate_stage_after_ai_job", {
    _candidate_id: candidateId,
    _job_id: jobId,
    _expected_current_stage: body.expected_current_stage ?? null,
    _next_stage: nextStage,
    _job_type: jobType,
  });
  if (error) return jsonResponse({ error: "rpc_failed", detail: error.message.slice(0, 80) }, 500);
  return jsonResponse(data, 200);
});