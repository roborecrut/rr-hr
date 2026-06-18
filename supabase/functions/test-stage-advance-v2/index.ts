// Throwaway test runner: invokes the SECURITY DEFINER `_test_advance_stage_v2_run`
// RPC which exercises advance_candidate_stage_after_ai_job_v2 against real DB
// fixtures inside a single function call and cleans them up. The function is
// gated by a shared header secret so it cannot be hit anonymously.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin" }, 500);
  const { data, error } = await admin.rpc("_test_advance_stage_v2_run");
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse(data, 200);
});