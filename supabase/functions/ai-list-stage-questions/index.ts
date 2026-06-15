// Returns the stage test questions to candidates with correct/expected_answer stripped.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { project_id: string; stage: string; candidate_token?: string };
  if (!body?.project_id || !body?.stage) return jsonResponse({ error: "bad_body" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data, error } = await admin.from("training_stage_tests")
    .select("questions,total_score,pass_score,ai_generated_at,shuffle_questions")
    .eq("project_id", body.project_id).eq("stage", body.stage).maybeSingle();
  if (error) return jsonResponse({ error: error.message }, 500);
  if (!data) return jsonResponse({ ok: true, questions: [], total_score: 0, pass_score: 70, shuffle: true });

  const sanitized = (data.questions as any[] || []).map((q) => ({
    id: q.id, kind: q.kind, question: q.question, points: q.points,
    options: q.kind === "choice" ? (q.options || []).map((o: any) => ({ text: o.text })) : null,
  }));
  return jsonResponse({ ok: true, questions: sanitized, total_score: data.total_score, pass_score: data.pass_score, shuffle: (data as any).shuffle_questions !== false });
});