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
// Status codes:
//   200 ok
//   400 bad_body | invalid_uuid
//   401 candidate_token_required | bad_token | expired_token
//   403 forbidden        (job exists but belongs to a different candidate)
//   404 not_found
//   405 method_not_allowed
//   500 internal
//
// CORS: Access-Control-Allow-Origin is an explicit allowlist (not "*"), and
// `candidate_id` from the body is IGNORED — ownership is always derived
// server-side from the candidate session bound to the token. The status
// payload deliberately excludes request_snapshot, resume_text, reports,
// prompts, AI responses, raw errors, and provider secrets.
// =============================================================================
import { corsHeaders as defaultCors } from "../_shared/cors.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { getAdminClient } from "../_shared/protalk.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ORIGINS = new Set<string>([
  "https://hr-rr.ru",
  "https://www.hr-rr.ru",
  "https://hr-rr.online",
  "https://www.hr-rr.online",
  "https://hr-rr.lovable.app",
  "https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function corsFor(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return { ...defaultCors, "Access-Control-Allow-Origin": allow, Vary: "Origin" };
}

function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsFor(req) });
  if (req.method !== "POST") return reply(req, { error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    job_id?: string;
    candidate_token?: string;
  };
  if (!body) return reply(req, { error: "bad_body" }, 400);
  const jobId = String(body.job_id || "").trim();
  if (!UUID_RE.test(jobId)) return reply(req, { error: "invalid_uuid" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) {
    const text = await authz.text().catch(() => '{"error":"unauthorized"}');
    return new Response(text, {
      status: authz.status,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  }
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return reply(req, { error: "internal" }, 500);

  const { data: job, error: jobErr } = await admin
    .from("ai_jobs")
    .select("id, candidate_id, job_type, status, fallback_used, created_at, updated_at, completed_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) return reply(req, { error: "internal" }, 500);
  if (!job) return reply(req, { error: "not_found" }, 404);
  if ((job as any).candidate_id !== candidateId) return reply(req, { error: "forbidden" }, 403);

  const { count: attemptsCount } = await admin
    .from("ai_job_attempts")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  return reply(req, {
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