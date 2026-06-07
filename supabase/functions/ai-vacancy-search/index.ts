// AI semantic search over published vacancies. Takes a natural-language query
// and a precomputed list of vacancies, returns the matching vacancy IDs ranked
// by relevance with a short explanation per match.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    query: string;
    vacancies: Array<{
      id: string;
      role: string;
      company: string;
      industry?: string;
      salary?: string;
      schedule?: string;
      summary?: string;
    }>;
  };
  if (!body?.query || !Array.isArray(body.vacancies) || body.vacancies.length === 0) {
    return jsonResponse({ error: "bad_body" }, 400);
  }

  const list = body.vacancies
    .slice(0, 200)
    .map((v, i) => `[${i + 1}] id=${v.id}
роль: ${v.role}
компания: ${v.company}${v.industry ? ` (${v.industry})` : ""}
оплата: ${v.salary || "—"}
график: ${v.schedule || "—"}
о вакансии: ${(v.summary || "").slice(0, 600)}`)
    .join("\n\n");

  const sys =
    "Ты — поисковый ассистент по каталогу вакансий. На вход получаешь запрос пользователя и список вакансий. " +
    "Возвращай ТОЛЬКО валидный JSON-массив объектов вида " +
    `{"id":"<vacancy_id>","reason":"<краткое объяснение почему подходит, 1 предложение>"} ` +
    "от самых релевантных к менее. Если ничего не подходит — верни []. " +
    "Не добавляй никакого текста кроме JSON.";

  const message = `${sys}\n\nЗапрос пользователя: "${body.query}"\n\nВакансии:\n\n${list}\n\nОтвет (только JSON-массив):`;

  try {
    const { text } = await callProTalk({
      message,
      chatId: buildChatId({}),
      socialId: buildSocialId({}),
    });
    // Extract JSON array from response
    const m = text.match(/\[[\s\S]*\]/);
    let parsed: Array<{ id: string; reason?: string }> = [];
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
    }
    const validIds = new Set(body.vacancies.map((v) => v.id));
    const results = parsed.filter((r) => r && typeof r.id === "string" && validIds.has(r.id));
    return jsonResponse({ ok: true, results, raw: text });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});