// Generate a 20-question test for ONE stage from concatenated stage materials_md.
// Stores in training_stage_tests with correct/expected_answer kept server-side.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb, resolveEmployerPublicId,
} from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";
import { createOrReuseAiJob, startPrimaryAttempt, finishAttempt, markJobStatus } from "../_shared/ai-jobs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    project_id: string; stage: string; wishes?: string; context_keys?: string[];
  };
  if (!body?.project_id || !body?.stage) return jsonResponse({ error: "bad_body" }, 400);

  const guard = await requireEmployerForProject(req, body.project_id);
  if (guard instanceof Response) return guard;
  if (!["professional","product","system"].includes(body.stage)) return jsonResponse({ error: "bad_stage" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: blocks } = await admin.from("training_blocks")
    .select("materials_md,title").eq("project_id", body.project_id).eq("stage", body.stage);
  let combined = (blocks || []).map((b: any) => `## ${b.title || ""}\n${b.materials_md || ""}`).join("\n\n");
  if (Array.isArray(body.context_keys) && body.context_keys.length) {
    const { data: proj } = await admin.from("projects").select("*").eq("id", body.project_id).maybeSingle();
    const p: any = proj || {};
    const map: Record<string, string> = {
      intro: p.training_intro_text || "",
      professional: p.training_professional_text || p.training_prof_text || "",
      product: p.training_product_text || "",
      systems: p.training_systems_text || p.training_system_text || "",
      regulations: p.training_regulations_text || "",
      wiki: p.training_wiki_text || "",
    };
    const extra = body.context_keys.map(k => map[k]).filter(Boolean).join("\n\n");
    if (extra) combined += `\n\n## Дополнительный контекст\n${extra}`;
  }
  if (!combined.trim()) return jsonResponse({ error: "no_material" }, 400);
  const wishes = (body.wishes || "").trim().slice(0, 1000);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const empPid = await resolveEmployerPublicId({ projectId: body.project_id, userId: user?.id });

  const chatId = buildChatId({ userId: user?.id, employerPublicId: empPid });

  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: empPid });

  const SCHEMA = `JSON-массив из 20 элементов (можно до 30, но не больше), без markdown, без обёрток. Каждый элемент:
{"id":string,"kind":"choice"|"text","question":string,"options":[{"text":string,"is_correct":boolean}]|null,"correct":string|null,"expected_answer":string|null,"points":5,"explanation":string}
— Первые 10 — kind:"choice", 4 варианта, ровно 1 правильный. Уклон в негативные формулировки («Что НЕ относится…», «Какой подход НЕЛЬЗЯ применять…»). Поле "correct" = текст правильного варианта.
— Последние 10 — kind:"text". options=null, correct=null, expected_answer — развернутый эталонный ответ (3-6 предложений), по которому будет оцениваться ответ кандидата.
— id уникален в массиве (например "q1".."q20"). points=5 у всех.`;

  const msg = `На основе материала ниже составь тест по этапу обучения.
${wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${wishes}\n` : ""}

МАТЕРИАЛ:
${combined.slice(0, 12000)}

Верни СТРОГО ${SCHEMA}`;

  const idem = `stage_test:${body.project_id}:${body.stage}`;
  const job = await createOrReuseAiJob({
    userId: user?.id || null,
    jobType: "stage_test",
    idempotencyKey: idem,
    requestSnapshot: {
      message: msg, project_id: body.project_id, stage: body.stage, timeout_ms: 180_000,
    },
    fallbackAllowed: true,
  });
  const jobId = "id" in job ? job.id : null;
  const attemptId = jobId ? await startPrimaryAttempt(jobId) : null;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — методист, создаёшь чёткие проверочные тесты по учебному материалу. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const arr = tryParseJson<any[]>(r.text);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("bad_quiz_json");

    const questions = arr.slice(0, 30).map((q, i) => ({
      id: String(q.id || `q${i+1}`),
      kind: q.kind === "text" ? "text" : "choice",
      question: String(q.question || "").slice(0, 1000),
      options: q.kind === "choice" ? (Array.isArray(q.options) ? q.options : []) : null,
      correct: q.kind === "choice"
        ? String(q.correct || (Array.isArray(q.options) ? (q.options.find((o:any)=>o.is_correct)?.text || "") : "")).slice(0, 500)
        : null,
      expected_answer: q.kind === "text" ? String(q.expected_answer || "").slice(0, 2000) : null,
      points: 5,
      explanation: q.explanation ? String(q.explanation).slice(0, 500) : "",
    }));
    const total = questions.reduce((s, q) => s + q.points, 0);

    const { data: existing } = await admin.from("training_stage_tests")
      .select("id, pass_score").eq("project_id", body.project_id).eq("stage", body.stage).maybeSingle();
    if (existing?.id) {
      // Preserve a user-tuned pass_score on regeneration. Only fall back to 70
      // when no pass score is stored at all.
      const keepPass = typeof existing.pass_score === "number" && existing.pass_score > 0
        ? Math.min(existing.pass_score, total)
        : Math.min(70, total);
      await admin.from("training_stage_tests").update({
        questions, total_score: total, pass_score: keepPass,
        ai_generated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await admin.from("training_stage_tests").insert({
        project_id: body.project_id, stage: body.stage, questions,
        total_score: total, pass_score: Math.min(70, total), ai_generated_at: new Date().toISOString(),
      });
    }

    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-test:${body.stage}`, server_name: "ai-generate-stage-test",
      function_call_params: JSON.stringify({ project_id: body.project_id, stage: body.stage }) });
    if (attemptId) await finishAttempt(attemptId, { status: "succeeded", result_reference: `training_stage_tests:${body.project_id}:${body.stage}` });
    if (jobId) await markJobStatus(jobId, "primary_succeeded", true);
    return jsonResponse({ ok: true, count: questions.length, total_score: total, job_id: jobId });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-test:${body.stage}`, server_name: "ai-generate-stage-test", function_error: err });
    if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: err.slice(0, 64) });
    if (jobId) {
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");
    }
    return jsonResponse({ error: err, job_id: jobId, fallback_available: !!jobId }, 500);
  }
});