// Stateless demo: AI-grade the checklist answers. No DB, no billing.
// Mirrors `ai-interview-grade-checklist` prompt so the demo shows the same
// per-question breakdown (verdict, explanation, what_was_right/wrong, summary,
// strengths, gaps) as the real candidate flow.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | {
    title: string;
    questions: { id: string; kind: "choice" | "text"; question: string; options?: string[] | null; correct?: string | null; expected_answer?: string | null }[];
    answers: Record<string, string>;
  };
  if (!body?.title || !Array.isArray(body?.questions) || !body?.answers) return jsonResponse({ error: "bad_body" }, 400);

  const chatId = buildChatId({});
  const socialId = buildSocialId({});

  const fullBatch = body.questions.map((q) => ({
    id: q.id,
    kind: q.kind || "text",
    question: q.question,
    options: q.options || null,
    correct: q.correct || null,
    expected: q.expected_answer || null,
    answer: (body.answers[q.id] || "").toString().slice(0, 3000),
  }));

  const msg = `Ты — строгий, но справедливый проверяющий ответы кандидата на чек-лист собеседования. Должность: "${body.title}".
Для каждого вопроса оцени ответ от 0 до 5 баллов (5 = идеально), укажи verdict (correct|partial|wrong), краткое объяснение, что было верно (what_was_right) и что нужно улучшить (what_was_wrong).
Затем дай итог: общий процент (total 0..100), краткое summary (2-3 предложения), массив strengths и gaps (по 2-4 пункта).
Учитывай, что для вопросов kind="choice" эталон в поле correct, а для text — в expected. Если поле пустое — оценивай по смыслу.

ВОПРОСЫ И ОТВЕТЫ:
${JSON.stringify(fullBatch)}

Верни СТРОГО JSON без markdown:
{"items":[{"id":string,"score":0..5,"max":5,"verdict":"correct|partial|wrong","explanation":string,"what_was_right":string,"what_was_wrong":string}],"total":0..100,"summary":string,"strengths":[string],"gaps":[string]}`;

  let aiObj: any = null;
  let aiText = "";
  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 180_000 });
    aiText = r.text;
    if (!aiText || !aiText.trim()) {
      await logToDb({ user_message: msg.slice(0,5000), bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-checklist", server_name: "ai-demo-grade-checklist", function_error: "empty_response" });
      return jsonResponse({ error: "empty_response" }, 502);
    }
    aiObj = tryParseJson<any>(r.text) || null;
    if (!aiObj || !Array.isArray(aiObj?.items)) {
      await logToDb({ user_message: msg.slice(0,5000), bot_reply: aiText.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-checklist", server_name: "ai-demo-grade-checklist", function_error: "schema_invalid" });
      return jsonResponse({ error: "schema_invalid" }, 502);
    }
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }

  const items: any[] = [];
  for (const q of body.questions) {
    const ans = (body.answers[q.id] || "").toString().trim();
    const aiItem = (aiObj?.items || []).find((x: any) => String(x.id) === String(q.id));
    if (aiItem) {
      items.push({
        id: q.id,
        question: q.question,
        answer: ans,
        correct: q.kind === "choice" ? (q.correct || "") : (q.expected_answer || ""),
        score: Math.max(0, Math.min(5, Number(aiItem.score) || 0)),
        max: 5,
        verdict: String(aiItem.verdict || ""),
        explanation: String(aiItem.explanation || "").slice(0, 800),
        what_was_right: String(aiItem.what_was_right || "").slice(0, 500),
        what_was_wrong: String(aiItem.what_was_wrong || "").slice(0, 500),
      });
    } else if (q.kind === "choice") {
      const ok = !!(ans && q.correct && ans.trim().toLowerCase() === String(q.correct).trim().toLowerCase());
      items.push({ id: q.id, question: q.question, answer: ans, correct: q.correct || "", score: ok ? 5 : 0, max: 5, verdict: ok ? "correct" : "wrong", explanation: ok ? "Верно" : `Правильный ответ: ${q.correct || ""}`, what_was_right: ok ? "Выбран правильный вариант" : "", what_was_wrong: ok ? "" : "Выбран неправильный вариант" });
    } else {
      items.push({ id: q.id, question: q.question, answer: ans, correct: q.expected_answer || "", score: 0, max: 5, verdict: "wrong", explanation: "Не удалось оценить ИИ", what_was_right: "", what_was_wrong: "" });
    }
  }

  const total = items.reduce((s, x) => s + x.score, 0);
  const max = items.reduce((s, x) => s + x.max, 0) || 1;
  const score100 = aiObj?.total != null ? Math.round(Number(aiObj.total)) : Math.round((total / max) * 100);
  const feedback = {
    items,
    total: score100,
    summary: String(aiObj?.summary || "").slice(0, 1500),
    strengths: Array.isArray(aiObj?.strengths) ? aiObj.strengths.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
    gaps: Array.isArray(aiObj?.gaps) ? aiObj.gaps.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
  };

  await logToDb({ user_message: msg.slice(0, 5000), bot_reply: aiText.slice(0, 5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-checklist", server_name: "ai-demo-grade-checklist" });
  return jsonResponse({ ok: true, score: score100, feedback });
});