// Stateless demo: grade checklist answers. No DB, no billing.
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

  const items = body.questions.map(q => ({
    id: q.id,
    kind: q.kind,
    question: q.question,
    options: q.options || null,
    correct: q.correct || null,
    expected_answer: q.expected_answer || null,
    answer: (body.answers[q.id] || "").toString().slice(0, 2000),
  }));

  const msg = `Ты — эксперт-оценщик чек-листа на собеседовании. Должность: "${body.title}".
Для каждого вопроса оцени ответ кандидата (0-100), дай короткий комментарий и пометь verdict: "correct" | "partial" | "wrong".
Для choice — сравнивай с поле "correct". Для text — оценивай содержательность относительно "expected_answer".

ВОПРОСЫ И ОТВЕТЫ:
${JSON.stringify(items)}

Верни СТРОГО JSON:
{
  "score": 0..100 (средний по всем вопросам),
  "summary": string (2-3 предложения общего вывода),
  "strengths": string[] (1-4),
  "gaps": string[] (1-4),
  "items": [{"id":string,"question":string,"answer":string,"correct":string,"verdict":"correct"|"partial"|"wrong","score":0..100,"max":100,"explanation":string}]
}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 180_000 });
    const obj = tryParseJson<any>(r.text) || {};
    const itemsOut = Array.isArray(obj.items) ? obj.items.map((it: any) => ({
      id: String(it.id || ""),
      question: String(it.question || "").slice(0, 600),
      answer: String(it.answer || "").slice(0, 1000),
      correct: String(it.correct || "").slice(0, 600),
      verdict: ["correct","partial","wrong"].includes(it.verdict) ? it.verdict : "partial",
      score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      max: 100,
      explanation: String(it.explanation || "").slice(0, 400),
    })) : [];
    const score = Math.max(0, Math.min(100, Number(obj.score) || (itemsOut.length ? Math.round(itemsOut.reduce((s: number, x: any) => s + x.score, 0) / itemsOut.length) : 0)));
    const feedback = {
      summary: String(obj.summary || "").slice(0, 1000),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 6).map((s: any) => String(s).slice(0, 300)) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 6).map((s: any) => String(s).slice(0, 300)) : [],
      items: itemsOut,
    };
    await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-checklist", server_name: "ai-demo-grade-checklist" });
    return jsonResponse({ ok: true, score, feedback });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});