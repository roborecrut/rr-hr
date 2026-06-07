// Stateless demo: prepare situations + checklist + resume criteria for a public job title.
// No DB writes, no billing — used by /demo landing for free interview demo.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | {
    title: string;
    vacancy_text?: string;
  };
  if (!body?.title) return jsonResponse({ error: "bad_body" }, 400);

  const chatId = buildChatId({});
  const socialId = buildSocialId({});

  const SCHEMA = `JSON-объект:
{
  "situations": [ {"id":"s1","title":string,"brief":string,"criteria":string}, {"id":"s2",...}, {"id":"s3",...} ],
  "checklist":  [ {"id":"q1","kind":"choice","question":string,"options":[string,string,string,string],"correct":string}, ... ровно 6 элементов: 3 choice + 3 text. У text: "options":null,"correct":null,"expected_answer":string ],
  "resume_criteria": string (markdown, 4-7 пунктов, что должно быть в идеальном резюме на эту должность)
}
- situations: 3 реалистичные ролевые ситуации, brief 3-5 предложений от лица клиента/контрагента/руководителя; criteria — 3-5 пунктов через ";".
- checklist: 6 проверочных вопросов. Первые 3 — kind:"choice" (4 варианта, один правильный). Последние 3 — kind:"text" (открытый ответ, expected_answer — эталон 2-3 предложения).
- resume_criteria: краткий чек-лист для скрининга резюме на эту должность.
Без markdown-обёрток, без \`\`\`json.`;

  const msg = `Подготовь короткое демо-собеседование на должность "${body.title}".
${body.vacancy_text ? `\nКонтекст должности:\n${String(body.vacancy_text).slice(0, 3000)}\n` : ""}
Цель: дать незнакомому посетителю сайта попробовать формат ИИ-найма за ~10 минут.

Верни СТРОГО ${SCHEMA}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 150_000 });
    const obj = tryParseJson<any>(r.text) || {};

    const situations = Array.isArray(obj.situations) ? obj.situations.slice(0, 3).map((s: any, i: number) => ({
      id: String(s.id || `s${i+1}`),
      title: String(s.title || "").slice(0, 200),
      brief: String(s.brief || "").slice(0, 1500),
      criteria: String(s.criteria || "").slice(0, 1000),
    })) : [];

    const checklist = Array.isArray(obj.checklist) ? obj.checklist.slice(0, 8).map((q: any, i: number) => {
      const kind = q.kind === "text" ? "text" : "choice";
      const opts = Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : String(o?.text || "")) : null;
      return {
        id: String(q.id || `q${i+1}`),
        kind,
        question: String(q.question || "").slice(0, 600),
        options: kind === "choice" ? (opts || []).slice(0, 4) : null,
        correct: kind === "choice" ? String(q.correct || (opts?.[0] || "")).slice(0, 400) : null,
        expected_answer: kind === "text" ? String(q.expected_answer || "").slice(0, 1000) : null,
      };
    }) : [];

    const resume_criteria = String(obj.resume_criteria || "").slice(0, 3000);

    if (situations.length === 0 || checklist.length === 0) throw new Error("bad_json");

    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: r.text.slice(0, 5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:prepare", server_name: "ai-demo-prepare" });
    return jsonResponse({ ok: true, situations, checklist, resume_criteria });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-demo:prepare", server_name: "ai-demo-prepare", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});