// Stateless demo: score resume against a job title. No DB, no billing.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | {
    title: string;
    vacancy_text?: string;
    criteria_md?: string;
    resume_text: string;
  };
  if (!body?.title || !body?.resume_text) return jsonResponse({ error: "bad_body" }, 400);

  const chatId = buildChatId({});
  const socialId = buildSocialId({});

  const msg = `Ты HR-эксперт. Оцени резюме кандидата на должность "${body.title}".

Критерии оценки:
${body.criteria_md || "(используй стандартные критерии для этой должности)"}

${body.vacancy_text ? `Контекст должности:\n${String(body.vacancy_text).slice(0, 3000)}\n` : ""}

РЕЗЮМЕ КАНДИДАТА:
${String(body.resume_text).slice(0, 10000)}

Верни СТРОГО JSON: {"score":0..100,"summary":string (3-4 предложения для кандидата),"strengths":string[] (2-5),"gaps":string[] (2-5)}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 120_000 });
    const obj = tryParseJson<any>(r.text) || {};
    const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
    const result = {
      score,
      summary: String(obj.summary || "").slice(0, 1500),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
    };
    await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:screen-resume", server_name: "ai-demo-screen-resume" });
    return jsonResponse({ ok: true, result });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});