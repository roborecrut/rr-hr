// Public read of checklist questions WITHOUT correct/expected_answer.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const [{ data: chk }, { data: sit }] = await Promise.all([
    admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","checklist").maybeSingle(),
    admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","situations").maybeSingle(),
  ]);

  const questions = ((chk as any)?.payload?.questions || []).map((q: any) => ({
    id: q.id, kind: q.kind, question: q.question,
    options: q.kind === "choice" ? q.options : null,
  }));
  const situations = ((sit as any)?.payload?.situations || []).map((s: any) => ({ id: s.id, title: s.title, brief: s.brief }));

  return jsonResponse({ ok: true, questions, situations });
});