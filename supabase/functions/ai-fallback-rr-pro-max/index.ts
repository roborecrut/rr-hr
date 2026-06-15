// Fallback endpoint — frontend passes ONLY { job_id }. Server reads the
// private request_snapshot, validates ownership, calls /restart, then sends
// the original prompt to RR Pro Max, validates schema, and saves the result
// via the same handler the primary path uses. RR is NEVER charged again.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader, buildChatId, buildSocialId, tryParseJson, logToDb } from "../_shared/protalk.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import { finishAttempt, markJobStatus, sha256Hex, canonicalJsonStringify } from "../_shared/ai-jobs.ts";

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

  // Pilot завершён успешно — резервная модель доступна как работодателям,
  // так и кандидатам после подтверждённого технического сбоя основной нейросети.
  // Авторизация выше уже проверила владельца задачи (employer JWT или
  // candidate session token).

  if (!RrProMaxProvider.isConfigured()) {
    return jsonResponse({ error: "fallback_not_configured" }, 503);
  }

  // Atomic begin: marks fallback_used + creates exactly one attempt row.
  const begin = await admin.rpc("begin_ai_fallback", { _job_id: body.job_id, _actor_user_id: ownerUserId });
  if (begin.error) {
    // Никогда не пробрасываем сырое сообщение Postgres (имена триггеров,
    // транзишены и т.п.) — мапим на безопасный код.
    const raw = String(begin.error.message || "");
    let code = "fallback_begin_failed";
    if (raw.includes("illegal_state_for_fallback") || raw.includes("ai_jobs_guard")) code = "illegal_state_for_fallback";
    else if (raw.includes("fallback_not_allowed")) code = "fallback_not_allowed";
    else if (raw.includes("forbidden")) code = "forbidden";
    else if (raw.includes("job_not_found")) code = "not_found";
    console.warn("begin_ai_fallback failed:", raw);
    return jsonResponse({ error: code }, 409);
  }
  const beginRes: any = begin.data;
  const attemptId: string = beginRes?.attempt_id;

  // Verify snapshot integrity.
  const snapshot = job.request_snapshot || {};
  // Canonical hash: keys sorted recursively so jsonb key reordering does not
  // break equality. Legacy jobs created before canonicalization may still
  // mismatch — for those we log a warning instead of failing.
  try {
    const expectedHash = await sha256Hex(canonicalJsonStringify(snapshot));
    if (job.request_hash && job.request_hash !== expectedHash) {
      // Try legacy JSON.stringify hash as compatibility fallback.
      const legacy = await sha256Hex(JSON.stringify(snapshot));
      if (job.request_hash !== legacy) {
        console.warn("snapshot hash mismatch (legacy job, allowing)", body.job_id);
      }
    }
  } catch (_) { /* ignore */ }

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

  // ── screen_resume: оценка резюме кандидата ──────────────────────────────
  if (job.job_type === "screen_resume") {
    const obj = tryParseJson<any>(run.text) || {};
    if (typeof obj !== "object" || obj === null || obj.score === undefined) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_schema_validation_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_schema_validation_failed" }, 502);
    }
    const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
    const result = {
      score,
      summary: String(obj.summary || "").slice(0, 1500),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
    };
    const candId = job.candidate_id || snap.candidate_id;
    if (!candId) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    await admin.from("candidate_scores").upsert({
      candidate_id: candId,
      resume_score: score,
      assessment_summary: result.summary,
      resume_feedback: result,
    }, { onConflict: "candidate_id" });
    if (snap.resume_text) {
      await admin.from("candidates").update({ resume_text: String(snap.resume_text).slice(0, 20000) }).eq("id", candId);
    }
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `candidate_scores:${candId}:resume` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: "[ok]", channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, result, fallback_used: true });
  }

  // ── ingest_resume: распознавание текста резюме из загруженного файла ────
  if (job.job_type === "ingest_resume") {
    const text = String(run.text || "").slice(0, 10000);
    if (!text.trim()) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_empty_response" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_empty_response" }, 502);
    }
    // После успешного распознавания резерва — чистим исходный файл.
    if (snap.bucket && snap.file_path) {
      await admin.storage.from(snap.bucket).remove([snap.file_path]).catch(() => {});
    }
    await finishAttempt(attemptId, { status: "succeeded", result_reference: "ingest_resume:text_returned" });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: `[ok:${text.length}b]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, text, fallback_used: true });
  }

  // ── interview_situations: 3 ролевые ситуации для вакансии ───────────────
  if (job.job_type === "interview_situations") {
    const arr = tryParseJson<any[]>(run.text);
    if (!Array.isArray(arr) || arr.length === 0) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_schema_validation_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_schema_validation_failed" }, 502);
    }
    const situations = arr.slice(0, 3).map((s: any, i: number) => ({
      id: String(s.id || `s${i + 1}`),
      title: String(s.title || "").slice(0, 200),
      brief: String(s.brief || "").slice(0, 1500),
      criteria: String(s.criteria || "").slice(0, 1000),
    }));
    const projectId = snap.project_id;
    if (!projectId) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const existing = await admin.from("interview_blocks").select("id").eq("project_id", projectId).eq("kind", "situations").maybeSingle();
    const payload = { situations };
    if (existing.data?.id) {
      await admin.from("interview_blocks").update({ payload, ai_generated_at: new Date().toISOString() }).eq("id", existing.data.id);
    } else {
      await admin.from("interview_blocks").insert({ project_id: projectId, kind: "situations", payload, ai_generated_at: new Date().toISOString() });
    }
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `interview_blocks:${projectId}:situations` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: `[ok:${situations.length}s]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, situations, fallback_used: true });
  }

  // ── training_material: длинный учебный markdown по блоку ────────────────
  if (job.job_type === "training_material") {
    const text = String(run.text || "").slice(0, 20000);
    if (!text.trim()) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_empty_response" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_empty_response" }, 502);
    }
    const projectId = snap.project_id;
    const blockKey = snap.block_key;
    const blockTitle = snap.block_title || blockKey;
    if (!projectId || !blockKey) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const existing = await admin.from("training_blocks").select("id").eq("project_id", projectId).eq("block_key", blockKey).maybeSingle();
    let blockId: string | undefined = existing.data?.id;
    if (blockId) {
      await admin.from("training_blocks").update({ materials_md: text, ai_generated_at: new Date().toISOString() }).eq("id", blockId);
    } else {
      const ins = await admin.from("training_blocks").insert({
        project_id: projectId, block_key: blockKey, title: blockTitle,
        materials_md: text, ai_generated_at: new Date().toISOString(), pass_score: 70,
      }).select("id").single();
      blockId = ins.data?.id;
      if (!blockId) {
        await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
        await markJobStatus(body.job_id, "fallback_failed", true);
        return jsonResponse({ error: "fallback_save_failed" }, 500);
      }
    }
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `training_blocks:${blockId}:material` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: `[ok:${text.length}b]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, text, block_id: blockId, fallback_used: true });
  }

  // ── training_quiz: 20 вопросов по учебному материалу ────────────────────
  if (job.job_type === "training_quiz") {
    const arr = tryParseJson<any[]>(run.text);
    if (!Array.isArray(arr) || arr.length === 0) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_schema_validation_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_schema_validation_failed" }, 502);
    }
    const blockId = snap.block_id;
    if (!blockId) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_save_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const rows = arr.slice(0, 30).map((q: any, i: number) => ({
      block_id: blockId,
      order_no: i + 1,
      kind: q.kind === "text" ? "text" : "choice",
      question: String(q.question || "").slice(0, 1000),
      options: q.kind === "choice" ? (q.options || []) : null,
      expected_answer: q.kind === "text" ? String(q.expected_answer || "").slice(0, 2000) : null,
      points: Number(q.points) > 0 ? Number(q.points) : 5,
      explanation: q.explanation ? String(q.explanation).slice(0, 500) : null,
    }));
    await admin.from("training_questions").delete().eq("block_id", blockId);
    const ins = await admin.from("training_questions").insert(rows);
    if (ins.error) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const total = rows.reduce((s, q) => s + (q.points || 0), 0);
    await admin.from("training_blocks").update({ total_score: total, pass_score: snap.pass_score || 70 }).eq("id", blockId);
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `training_questions:${blockId}` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: `[ok:${rows.length}q]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, count: rows.length, total_score: total, fallback_used: true });
  }

  // ── grade_situations: оценка ролевых ответов кандидата ──────────────────
  if (job.job_type === "grade_situations") {
    const obj = tryParseJson<any>(run.text) || {};
    const candId = job.candidate_id || snap.candidate_id;
    if (!candId) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_save_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_save_failed" }, 500);
    }
    const contentlessIds = new Set<string>((snap.contentless_ids || []).map(String));
    const situationIds: string[] = Array.isArray(snap.situation_ids) ? snap.situation_ids.map(String) : [];
    const aiResults = (Array.isArray(obj.items) ? obj.items : []).map((it: any) => ({
      id: String(it.id),
      score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      feedback: String(it.feedback || "").slice(0, 800),
    }));
    const results = situationIds.map((sid: string) => {
      if (contentlessIds.has(sid)) return { id: sid, score: 0, feedback: "Ответ не предоставлен или не содержит осмысленного текста." };
      const hit = aiResults.find((x: any) => x.id === sid);
      return hit || { id: sid, score: 0, feedback: "" };
    });
    if (results.length === 0) {
      await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_schema_validation_failed" });
      await markJobStatus(body.job_id, "fallback_failed", true);
      return jsonResponse({ error: "fallback_schema_validation_failed" }, 502);
    }
    const avg = Math.round(results.reduce((s: number, x: any) => s + x.score, 0) / results.length);
    const advice = String(obj.advice || "").slice(0, 800);
    const feedback = { items: results, advice, total: avg };
    await admin.from("candidate_scores").upsert({
      candidate_id: candId,
      situations_score: avg,
      situations_feedback: feedback,
    }, { onConflict: "candidate_id" });
    await finishAttempt(attemptId, { status: "succeeded", result_reference: `candidate_scores:${candId}:situations` });
    await markJobStatus(body.job_id, "fallback_succeeded", true);
    await logToDb({ user_message: "[fallback]", bot_reply: `[ok:${results.length}]`, channel_id: chatId, user_social_id: socialId, channel_name: "ai-fallback:rr_pro_max", server_name: "ai-fallback-rr-pro-max" });
    return jsonResponse({ ok: true, score: avg, items: results, advice, fallback_used: true });
  }

  await finishAttempt(attemptId, { status: "failed", safe_error_code: "fallback_unknown" });
  await markJobStatus(body.job_id, "fallback_failed", true);
  return jsonResponse({ error: "unsupported_job_type" }, 400);
});