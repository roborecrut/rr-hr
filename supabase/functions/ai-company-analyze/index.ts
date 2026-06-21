// Analyze a company description (text or document URL) via ProTalk and return strict JSON.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt, assertProjectOwner } from "../_shared/auth.ts";

const SCHEMA = `Верни СТРОГО один JSON-объект без markdown с такими ключами и ограничениями длины (символы):
{
  "name": string (≤80),
  "industry": string (≤80) — отрасль/сфера деятельности (например: "Финтех", "Ритейл", "Производство кофе"),
  "website": string (≤200) — официальный сайт компании, корректный URL (например: "https://acme.ru"). Если не известен — пустая строка,
  "staff": string (≤80) — количество сотрудников свободным текстом (например: "около 120 человек" или "1500+ сотрудников"),
  "description_text": string (≤600) — чем компания занимается,
  "products_text": string (≤500) — основные продукты/услуги,
  "mission_text": string (≤500) — имидж, миссия и культура,
  "team_text": string (≤500),
  "payouts_text": string (≤300),
  "schedule_text": string (≤300),
  "system_text": string (≤500) — система работы,
  "stats": { "founded_year": number|null (4 цифры), "employees": number|null, "turnover": string|null (≤8 символов) }
}
Если данных нет — оставь пустую строку "" или null. Никаких комментариев.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    company_id?: string;
    employer_public_id?: string;
    file_url?: string;
    raw_text?: string;
  };
  if (!body || (!body.file_url && !body.raw_text)) return jsonResponse({ error: "bad_body" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  if (body.company_id) {
    const own = await assertProjectOwner({ userId: auth.userId, companyId: body.company_id });
    if (own instanceof Response) return own;
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id, employerPublicId: body.employer_public_id });
  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: body.employer_public_id });

  const userMsg = body.file_url
    ? `Проанализируй документ компании по ссылке: ${body.file_url}\n\n${SCHEMA}`
    : `Проанализируй описание компании:\n${body.raw_text}\n\n${SCHEMA}`;

  try {
    const { text, raw } = await callProTalk({
      messages: [
        { role: "system", content: "Ты — аналитик HR. Извлекаешь структурированные данные о компании в строгий JSON." },
        { role: "user", content: userMsg },
      ],
      chatId, socialId,
    });
    const parsed = tryParseJson<Record<string, any>>(text) || {};
    await logToDb({
      user_message: userMsg,
      bot_reply: text,
      channel_id: chatId, user_social_id: socialId,
      channel_name: "ai-company-analyze", server_name: "ai-company-analyze",
      function_call_params: JSON.stringify({ company_id: body.company_id, file_url: body.file_url }),
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
    });
    return jsonResponse({ ok: true, fields: parsed, raw: text });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: userMsg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-company-analyze", server_name: "ai-company-analyze", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});