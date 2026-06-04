// Enhance vacancy/company fields via ProTalk.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk, tryParseJson, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb,
} from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    mode: "single" | "all_vacancy" | "all_company";
    field?: string;
    value?: string;
    fields?: Record<string, string>;
    role_name?: string;
    company_name?: string;
    hint?: string;
  };
  if (!body?.mode) return jsonResponse({ error: "bad_body" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  try {
    if (body.mode === "single") {
      const { text, raw } = await callProTalk({
        messages: [
          { role: "system", content: "Ты — редактор HR-контента. Улучшаешь текст одного поля вакансии или компании, делая его профессиональным и продающим. Возвращай ТОЛЬКО улучшенный текст без комментариев и без кавычек вокруг." },
          { role: "user", content: `Роль: ${body.role_name ?? "—"}\nКомпания: ${body.company_name ?? "—"}\nПоле: ${body.field}\nИсходный текст:\n${body.value ?? ""}\n${body.hint ? `Подсказка: ${body.hint}` : ""}` },
        ],
      });
      const value = text.trim();
      await logToDb({
        user_message: `enhance.single field=${body.field}`,
        bot_reply: value,
        channel_id: chatId, user_social_id: socialId,
        channel_name: "ai-enhance:single", server_name: "ai-enhance",
        function_call_params: JSON.stringify({ field: body.field, role: body.role_name, company: body.company_name }),
        tokens_in_source: raw?.usage?.prompt_tokens ?? null,
        tokens_out_source: raw?.usage?.completion_tokens ?? null,
      });
      return jsonResponse({ value });
    }

    const { text, raw } = await callProTalk({
      messages: [
        { role: "system", content: "Ты — редактор HR-контента. Тебе дают JSON с полями вакансии или компании. Верни ТОЛЬКО JSON с теми же ключами, но с улучшенными значениями. Без markdown-обёрток, без пояснений." },
        { role: "user", content: `Контекст: роль ${body.role_name ?? "—"}, компания ${body.company_name ?? "—"}\n\nИсходные поля:\n${JSON.stringify(body.fields ?? {}, null, 2)}\n${body.hint ? `\nПодсказка: ${body.hint}` : ""}` },
      ],
    });
    const obj = tryParseJson<Record<string, string>>(text) ?? {};
    await logToDb({
      user_message: `enhance.${body.mode}`,
      bot_reply: text,
      channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-enhance:${body.mode}`, server_name: "ai-enhance",
      function_call_params: JSON.stringify({ role: body.role_name, company: body.company_name }),
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
    });
    return jsonResponse({ fields: obj });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({
      user_message: `enhance.${body.mode}`, bot_reply: "",
      channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-enhance:${body.mode}`, server_name: "ai-enhance",
      function_error: err,
    });
    return jsonResponse({ error: err }, 500);
  }
});