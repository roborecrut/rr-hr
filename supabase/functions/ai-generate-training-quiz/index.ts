// Generate 20 quiz questions (10 choice + 10 text) from a training block's material.
// Replaces existing training_questions for the block; updates total_score/pass_score.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt, assertProjectOwner } from "../_shared/auth.ts";
import { createOrReuseAiJob, startPrimaryAttempt, finishAttempt, markJobStatus } from "../_shared/ai-jobs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { block_id: string };
  if (!body?.block_id) return jsonResponse({ error: "bad_body" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: block, error: be } = await admin.from("training_blocks").select("*").eq("id", body.block_id).maybeSingle();
  if (be || !block) return jsonResponse({ error: "no_block" }, 404);
  // Verify the block's project belongs to the authenticated employer BEFORE running AI.
  const own = await assertProjectOwner({ userId: auth.userId, projectId: (block as any).project_id });
  if (own instanceof Response) return own;
  if (!block.materials_md) return jsonResponse({ error: "no_material" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const SCHEMA = `JSON-массив из ровно 20 элементов, без markdown, без обёрток. Каждый элемент:
{"kind":"choice"|"text","question":string,"options":[{"text":string,"is_correct":boolean}]|null,"expected_answer":string|null,"points":number,"explanation":string}
— Первые 10 — kind:"choice" с 4 вариантами (ровно 1 правильный). Уклон в негативные формулировки («Что НЕ относится…», «Какой подход НЕЛЬЗЯ применять…»). options обязателен; expected_answer null.
— Последние 10 — kind:"text". options null. expected_answer — эталон, по которому будет оцениваться текстовый ответ.
— Каждый вопрос: points=5. Итоговая сумма 100, проходной балл 70.`;

  const msg = `На основе материала ниже составь тест.\n\nМАТЕРИАЛ:\n${String(block.materials_md).slice(0, 9000)}\n\nВерни СТРОГО ${SCHEMA}`;

  const idem = `training_quiz:${body.block_id}`;
  const job = await createOrReuseAiJob({
    userId: auth.userId,
    jobType: "training_quiz",
    idempotencyKey: idem,
    requestSnapshot: {
      message: msg,
      block_id: body.block_id,
      project_id: (block as any).project_id,
      pass_score: block.pass_score || 70,
      timeout_ms: 180_000,
    },
    fallbackAllowed: true,
  });
  const jobId = "id" in job ? job.id : null;
  const attemptId = jobId ? await startPrimaryAttempt(jobId) : null;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — методист, создаёшь чёткие тесты по учебному материалу. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const arr = tryParseJson<any[]>(r.text);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("bad_quiz_json");

    await admin.from("training_questions").delete().eq("block_id", body.block_id);
    const rows = arr.slice(0, 30).map((q, i) => {
      const kind = q.kind === "text" ? "text" : "choice";
      let options: any[] | null = null;
      if (kind === "choice") {
        const rawOpts = Array.isArray(q.options) ? q.options : [];
        // Normalize: model sometimes returns `correct` as the text of the right
        // option instead of marking is_correct inside options. Reconcile both.
        const correctText = q.correct != null ? String(q.correct).trim() : "";
        let hasFlag = rawOpts.some((o: any) => o && o.is_correct === true);
        options = rawOpts.map((o: any) => {
          const text = String(o?.text ?? "").trim();
          let is_correct = !!o?.is_correct;
          if (!hasFlag && correctText && text && text === correctText) is_correct = true;
          return { text, is_correct };
        });
        // If still nothing flagged but options contain the correctText partially.
        if (!options.some((o: any) => o.is_correct) && correctText) {
          const idx = options.findIndex((o: any) => o.text.toLowerCase() === correctText.toLowerCase());
          if (idx >= 0) options[idx].is_correct = true;
        }
      }
      return {
        block_id: body.block_id,
        order_no: i + 1,
        kind,
        question: String(q.question || "").slice(0, 1000),
        options,
        expected_answer: kind === "text" ? String(q.expected_answer || "").slice(0, 2000) : null,
        points: Number(q.points) > 0 ? Number(q.points) : 5,
        explanation: q.explanation ? String(q.explanation).slice(0, 500) : null,
      };
    });
    const { error: ie } = await admin.from("training_questions").insert(rows);
    if (ie) throw new Error("save_failed: " + ie.message);

    const total = rows.reduce((s, q) => s + (q.points || 0), 0);
    await admin.from("training_blocks").update({ total_score: total, pass_score: block.pass_score || 70 }).eq("id", body.block_id);

    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId, channel_name: "ai-training-quiz", server_name: "ai-generate-training-quiz", function_call_params: JSON.stringify({ block_id: body.block_id }) });
    if (attemptId) await finishAttempt(attemptId, { status: "succeeded", result_reference: `training_questions:${body.block_id}` });
    if (jobId) await markJobStatus(jobId, "primary_succeeded", true);
    return jsonResponse({ ok: true, count: rows.length, total_score: total, job_id: jobId });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-training-quiz", server_name: "ai-generate-training-quiz", function_error: err });
    if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: err.slice(0, 64) });
    if (jobId) {
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");
    }
    return jsonResponse({ error: err, job_id: jobId, fallback_available: !!jobId }, 500);
  }
});