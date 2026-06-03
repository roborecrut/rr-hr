// Enhance vacancy/company fields with AI. Replaces enhance-single-field, enhance-all-fields, enhance-all-vacancy-fields.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { aiChat, tryParseJson } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    mode: "single" | "all_vacancy" | "all_company";
    field?: string;          // for single
    value?: string;          // for single
    fields?: Record<string, string>; // for all
    role_name?: string;
    company_name?: string;
    hint?: string;
  };
  if (!body?.mode) return jsonResponse({ error: "bad_body" }, 400);

  try {
    if (body.mode === "single") {
      const { text } = await aiChat({
        messages: [
          { role: "system", content: "Ты — редактор HR-контента. Улучшаешь текст одного поля вакансии или компании, делая его профессиональным и продающим. Возвращай ТОЛЬКО улучшенный текст без комментариев." },
          { role: "user", content: `Роль: ${body.role_name ?? "—"}\nКомпания: ${body.company_name ?? "—"}\nПоле: ${body.field}\nИсходный текст:\n${body.value ?? ""}\n${body.hint ? `Подсказка: ${body.hint}` : ""}` },
        ],
      });
      return jsonResponse({ value: text.trim() });
    }

    const { text } = await aiChat({
      json: true,
      messages: [
        { role: "system", content: "Ты — редактор HR-контента. Тебе дают JSON с полями вакансии или компании. Верни JSON ровно с теми же ключами, но с улучшенными значениями. Ничего не убирай, ничего не добавляй." },
        { role: "user", content: `Контекст: роль ${body.role_name ?? "—"}, компания ${body.company_name ?? "—"}\n\nИсходные поля:\n${JSON.stringify(body.fields ?? {}, null, 2)}` },
      ],
    });
    const obj = tryParseJson<Record<string, string>>(text) ?? {};
    return jsonResponse({ fields: obj });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});