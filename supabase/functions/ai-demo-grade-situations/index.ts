// Stateless demo: grade role-play situation answers. No DB, no billing.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | {
    title: string;
    situations: { id: string; title: string; brief: string; criteria?: string }[];
    answers: Record<string, string>;
  };
  if (!body?.title || !Array.isArray(body?.situations) || !body?.answers) return jsonResponse({ error: "bad_body" }, 400);

  const chatId = buildChatId({});
  const socialId = buildSocialId({});

  const items = body.situations.map(s => ({
    id: s.id, title: s.title, brief: s.brief, criteria: s.criteria || "",
    answer: (body.answers[s.id] || "").toString().slice(0, 3000),
  }));
  const msg = `Ты — оценщик ролевых ответов на собеседовании. Должность: "${body.title}".
По каждой ситуации оцени ответ кандидата от 0 до 100 баллов с учётом критериев и дай развёрнутый комментарий (2-3 предложения).

СИТУАЦИИ И ОТВЕТЫ:
${JSON.stringify(items)}

Верни СТРОГО JSON: {"items":[{"id":string,"score":0..100,"feedback":string}],"advice":string}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 150_000 });
    if (!r.text || !r.text.trim()) {
      await logToDb({ user_message: msg.slice(0,5000), bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-situations", server_name: "ai-demo-grade-situations", function_error: "empty_response" });
      return jsonResponse({ error: "empty_response" }, 502);
    }
    const obj = tryParseJson<any>(r.text) || {};
    const results = (Array.isArray(obj.items) ? obj.items : []).map((it: any) => ({
      id: String(it.id), score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      feedback: String(it.feedback || "").slice(0, 800),
    }));
    if (!results.length) {
      await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-situations", server_name: "ai-demo-grade-situations", function_error: "schema_invalid" });
      return jsonResponse({ error: "schema_invalid" }, 502);
    }
    const avg = results.length ? Math.round(results.reduce((s: number, x: any) => s + x.score, 0) / results.length) : 0;
    await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:grade-situations", server_name: "ai-demo-grade-situations" });
    return jsonResponse({ ok: true, score: avg, items: results, advice: String(obj.advice || "").slice(0, 800) });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});