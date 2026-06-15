// Fallback endpoint — frontend passes ONLY { job_id }. Server reads the
// private request_snapshot, validates ownership, calls /restart, then sends
// the original prompt to RR Pro Max, validates schema, and saves the result
// via the same handler the primary path uses. RR is NEVER charged again.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader, buildChatId, buildSocialId, tryParseJson, logToDb } from "../_shared/protalk.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import { finishAttempt, markJobStatus, sha256Hex } from "../_shared/ai-jobs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { job_id?: string };
  if (!body?.job_id) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  // Auth: employer JWT or candidate token.
  const auth = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const candidateToken = req.headers.get("x-candidate-token") || "";
  let ownerUserId: string | null = auth?.id || null;
  let ownerCandidateId: string | null = null;
  if (!ownerUserId) {
    if (!candidateToken) return jsonResponse({ error: "unauthorized" }, 401);
    const sess = await admin.from("candidate_sessions").select("candidate_id").eq("token", candidateToken).maybeSingle();
    if (!sess.data?.candidate_id) return jsonResponse({ error: "unauthorized" }, 401);
    ownerCandidateId = sess.data.candidate_id;
  }

  // Load job under service_role; ownership checked here AND inside RPC.
  const j = await admin.from("ai_jobs").select("*").eq("id", body.job_id).maybeSingle();
  if (!j.data) return jsonResponse({ error: "not_found" }, 404);
  const job: any = j.data;
  if (ownerUserId && job.user_id !== ownerUserId) return jsonResponse({ error: "forbidden" }, 403);
  if (ownerCandidateId && job.candidate_id !== ownerCandidateId) return jsonResponse({ error: "forbidden" }, 403);

  // Pilot gate: only employer with public_id = '100006' may run RR Pro Max
  // in production. Server-side enforcement — frontend hiding is not enough.
  if (ownerUserId) {
    const empRow = await admin
      .from("employers")
      .select("public_id")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    const pid = String((empRow.data as any)?.public_id || "");
    if (pid !== "100006") {
      return jsonResponse({ error: "fallback_pilot_disabled" }, 403);
    }
  } else {
    // Candidates are not in the pilot scope.
    return jsonResponse({ error: "fallback_pilot_disabled" }, 403);
  }

  if (!RrProMaxProvider.isConfigured()) {
    return jsonResponse({ error: "fallback_not_configured" }, 503);
  }

  // Atomic begin: marks fallback_used + creates exactly one attempt row.
  const begin = await admin.rpc("begin_ai_fallback", { _job_id: body.job_id, _actor_user_id: ownerUserId });
  if (begin.error) return jsonResponse({ error: begin.error.message }, 409);
  const beginRes: any = begin.data;
  const attemptId: string = beginRes?.attempt_id;

  // Verify snapshot integrity.
  const snapshot = job.request_snapshot || {};
  const expectedHash = await sha256Hex(JSON.stringify(snapshot));
  if (job.request_hash && job.request_hash !== expectedHash) {
    await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_snapshot_corrupt" });
    await markJobStatus(body.job_id, "fallback_failed", true);
    return jsonResponse({ error: "fallback_snapshot_corrupt" }, 500);
  }

  const snap: any = snapshot;
  const owner = ownerUserId || ownerCandidateId || undefined;
  const chatId = buildChatId({ userId: owner });
  const socialId = buildSocialId({ user_id: owner });

  // Step 1: /restart. Without success we DO NOT send the prompt.
  const restart = await RrProMaxProvider.restart(chatId, socialId);
  if (!restart.ok) {
    await finishAttempt(attemptId, { status: "failed", safe_error_code: restart.safeErrorCode });
    await markJobStatus(body.job_id, "fallback_failed", true);
    return jsonResponse({ error: restart.safeErrorCode }, 502);
  }

  await admin.from("ai_jobs").update({ status: "fallback_running" }).eq("id", body.job_id);

  // Step 2: original prompt from snapshot.
  const prompt: string = String(snap.message || "");
  if (!prompt) {
    await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
    await markJobStatus(body.job_id, "fallback_failed", true);
    return jsonResponse({ error: "fallback_save_failed" }, 500);
  }
  const run = await RrProMaxProvider.run(prompt, chatId, socialId, snap.timeout_ms || 180_000);
  if (!run.ok) {
    await finishAttempt(attemptId, { status: "failed", safe_error_code: run.safeErrorCode });
    await markJobStatus(body.job_id, "fallback_failed", true);
    return jsonResponse({ error: run.safeErrorCode }, 502);
  }

  // Schema + save: pilot supports job_type === 'interview_checklist'.
  if (job.job_type === "interview_checklist") {
    const arr = tryParseJson<any[]>(run.text);
    if (!Array.isArray(arr) || arr.length < 5) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_schema_validation_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_schema_validation_failed" }, 502);
    }
    const questions = arr.slice(0, 30).map((q: any, i: number) => {
      const kind = q.kind === "text" ? "text" : "choice";
      const opts = Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : String(o?.text || "")) : null;
      return {
        id: String(q.id || `q${i + 1}`),
        kind,
        question: String(q.question || "").slice(0, 800),
        options: kind === "choice" ? (opts || []).slice(0, 4) : null,
        correct: kind === "choice" ? String(q.correct || (opts?.[0] || "")).slice(0, 500) : null,
        expected_answer: kind === "text" ? String(q.expected_answer || "").slice(0, 1500) : null,
        explanation: q.explanation ? String(q.explanation).slice(0, 400) : "",
      };
    });
    const projectId = snap.project_id;
    if (!projectId) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const existing = await admin.from("interview_blocks").select("id").eq("project_id", projectId).eq("kind", "checklist").maybeSingle();
    const payload = { questions };
    if (existing.data?.id) {
      await admin.from("interview_blocks").update({ payload, ai_generated_at: new Date().toISOString() }).eq("id", existing.data.id);
    } else {
      await admin.from("interview_blocks").insert({ project_id: projectId, kind: "checklist", payload, ai_generated_at: new Date().toISOString() });
    }
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `interview_blocks:${projectId}:checklist` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: "[ok]", channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, count: questions.length, fallback_used: true });
  }

  await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_unknown" });
  await markJobStatus(body.job_id, "fallback_failed", true);
  return jsonResponse({ error: "unsupported_job_type" }, 400);
});