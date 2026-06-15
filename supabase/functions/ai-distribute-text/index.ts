// Take a free-form text and ask ProTalk to distribute it into typed fields for the entity.
// company → company fields (same schema as ai-company-analyze)
// vacancy → 15 canonical vacancy fields
// training → returns a markdown material chunk (caller decides where to save it)
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt } from "../_shared/auth.ts";

type Entity = "company" | "vacancy" | "training";

const SCHEMAS: Record<Entity, string> = {
  company: `JSON-объект (без markdown), ключи (необязательные):
{"name":string,"industry":string,"website":string,"staff":string,"description_text":string,"products_text":string,"mission_text":string,"team_text":string,"payouts_text":string,"schedule_text":string,"system_text":string,"about_text":string}`,
  vacancy: `JSON-объект (без markdown). Ключи — 15 канонических полей вакансии (всё опционально, заполняй что нашёл):
{"role_name":string,"role_summary":string,"responsibilities":string,"requirements":string,"conditions":string,"motivation":string,"payouts":string,"schedule":string,"growth":string,"onboarding":string,"team":string,"workplace":string,"training_professional":string,"training_product":string,"training_systems":string,"training_wiki":string,"training_regulations":string}`,
  training: `JSON-объект: {"material_md": string} — материал в Markdown до 10000 символов.`,
};

const SYS: Record<Entity, string> = {
  company: "Ты — HR-аналитик. Раскладываешь свободный текст о компании в строгие поля JSON.",
  vacancy: "Ты — HR-аналитик. Раскладываешь свободный текст о вакансии в строгие поля JSON.",
  training: "Ты — методист. Оформляешь свободный текст в учебный материал Markdown.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { entity: Entity; entity_id?: string; text?: string };
  if (!body || !body.entity || !body.text) return jsonResponse({ error: "bad_body" }, 400);
  if (!SCHEMAS[body.entity]) return jsonResponse({ error: "bad_entity" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });
  const msg = `Исходный текст:\n${body.text.slice(0, 10000)}\n\nВерни СТРОГО ${SCHEMAS[body.entity]}\nБез комментариев. Никаких пояснений.`;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: SYS[body.entity] }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const parsed = tryParseJson<Record<string, any>>(r.text) || {};
    await logToDb({
      user_message: msg, bot_reply: r.text,
      channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-distribute:${body.entity}`, server_name: "ai-distribute-text",
      function_call_params: JSON.stringify({ entity: body.entity, entity_id: body.entity_id }),
    });
    return jsonResponse({ ok: true, fields: parsed });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: `ai-distribute:${body.entity}`, server_name: "ai-distribute-text", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});