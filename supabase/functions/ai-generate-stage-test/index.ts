// Generate a 20-question test for ONE stage from concatenated stage materials_md.
// Stores in training_stage_tests with correct/expected_answer kept server-side.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { project_id: string; stage: string };
  if (!body?.project_id || !body?.stage) return jsonResponse({ error: "bad_body" }, 400);
  if (!["professional","product","system"].includes(body.stage)) return jsonResponse({ error: "bad_stage" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: blocks } = await admin.from("training_blocks")
    .select("materials_md,title").eq("project_id", body.project_id).eq("stage", body.stage);
  const combined = (blocks || []).map((b: any) => `## ${b.title || ""}\n${b.materials_md || ""}`).join("\n\n");
  if (!combined.trim()) return jsonResponse({ error: "no_material" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const SCHEMA = `JSON-массив из РОВНО 20 элементов, без markdown, без обёрток. Каждый элемент:
{"id":string,"kind":"choice"|"text","question":string,"options":[{"text":string,"is_correct":boolean}]|null,"correct":string|null,"expected_answer":string|null,"points":5,"explanation":string}
— Первые 10 — kind:"choice", 4 варианта, ровно 1 правильный. Уклон в негативные формулировки («Что НЕ относится…», «Какой подход НЕЛЬЗЯ применять…»). Поле "correct" = текст правильного варианта.
— Последние 10 — kind:"text". options=null, correct=null, expected_answer — развернутый эталонный ответ (3-6 предложений), по которому будет оцениваться ответ кандидата.
— id уникален в массиве (например "q1".."q20"). points=5 у всех. Итого 100, проходной 70.`;

  const msg = `На основе материала ниже составь тест по этапу обучения.

МАТЕРИАЛ:
${combined.slice(0, 12000)}

Верни СТРОГО ${SCHEMA}`;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — методист, создаёшь чёткие проверочные тесты по учебному материалу." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const arr = tryParseJson<any[]>(r.text);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("bad_quiz_json");

    const questions = arr.slice(0, 20).map((q, i) => ({
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
      .select("id").eq("project_id", body.project_id).eq("stage", body.stage).maybeSingle();
    if (existing?.id) {
      await admin.from("training_stage_tests").update({
        questions, total_score: total, pass_score: 70,
        ai_generated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await admin.from("training_stage_tests").insert({
        project_id: body.project_id, stage: body.stage, questions,
        total_score: total, pass_score: 70, ai_generated_at: new Date().toISOString(),
      });
    }

    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-test:${body.stage}`, server_name: "ai-generate-stage-test",
      function_call_params: JSON.stringify({ project_id: body.project_id, stage: body.stage }) });
    return jsonResponse({ ok: true, count: questions.length, total_score: total });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-test:${body.stage}`, server_name: "ai-generate-stage-test", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});