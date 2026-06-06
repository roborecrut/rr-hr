// Enhance vacancy/company fields via ProTalk.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk, tryParseJson, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb,
} from "../_shared/protalk.ts";

// Server-side length limits per field (in chars). Mirrors the client constraints
// so the AI cannot blow past UI limits even if the model returns long text.
const LIMITS: Record<string, number> = {
  name: 80,
  industry: 80,
  staff: 80,
  sites: 200,
  website: 200,
  logoUrl: 500,
  description: 600,
  description_text: 600,
  products_text: 500,
  mission_text: 500,
  missionText: 500,
  about_text: 600,
  team: 500,
  team_text: 500,
  payouts_text: 300,
  salaryTerms: 300,
  schedule_text: 300,
  scheduleTerms: 300,
  system_text: 600,
  customWiki: 600,
  statsValClients: 16,
  statsLabelClients: 40,
  statsValDialogs: 16,
  statsLabelDialogs: 40,
  statsValFounded: 8,
  statsLabelFounded: 40,
  // Vacancy fields
  roleName: 120,
  role_name: 120,
  vacancy_text: 1500,
  vacancyText: 1500,
  tasks_activity_text: 1000,
  tasksActivityText: 1000,
  motivation_text: 500,
  motivationText: 500,
  motivation_text_detail: 800,
  motivationTextDetail: 800,
  onboarding_text: 1000,
  onboardingText: 1000,
  team_text_vac: 600,
  system_text_vac: 600,
};
const clampField = (field: string | undefined, val: unknown): string => {
  const v = typeof val === "string" ? val : String(val ?? "");
  const max = field ? LIMITS[field] : undefined;
  if (!max) return v;
  return v.length > max ? v.slice(0, max).trimEnd() : v;
};

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
    template?: string;
    templates?: Record<string, string>;
  };
  if (!body?.mode) return jsonResponse({ error: "bad_body" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  try {
    if (body.mode === "single") {
      const buildSingleMessages = (strict: boolean) => [
        { role: "system" as const, content: `Ты — редактор HR-контента. Улучшаешь текст одного поля вакансии или компании, делая его профессиональным и продающим. Возвращай ТОЛЬКО улучшенный текст без комментариев и без кавычек вокруг. ВАЖНО: ответ должен быть не длиннее ${LIMITS[body.field ?? ""] ?? 600} символов.${body.template ? "\nОриентируйся на эталон заполнения по структуре, формату списков и тону. НЕ копируй эталон дословно — используй детали пользователя." : ""}${strict ? "\nНЕ вызывай никаких внешних инструментов, не ходи по URL, не делай поиск. Ответь сразу текстом из своей головы на основе данных пользователя." : ""}` },
        { role: "user" as const, content: `Роль: ${body.role_name ?? "—"}\nКомпания: ${body.company_name ?? "—"}\nПоле: ${body.field}\n${body.template ? `\nЭталон заполнения для роли:\n${body.template}\n` : ""}\nИсходный текст пользователя:\n${body.value ?? ""}\n${body.hint ? `Подсказка: ${body.hint}` : ""}` },
      ];

      let text = "";
      let raw: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await callProTalk({ messages: buildSingleMessages(attempt > 0), chatId, socialId });
        text = (r.text || "").trim();
        raw = r.raw;
        if (text) break;
      }
      if (!text) {
        await logToDb({
          user_message: `enhance.single field=${body.field}`,
          bot_reply: "",
          channel_id: chatId, user_social_id: socialId,
          channel_name: "ai-enhance:single", server_name: "ai-enhance",
          function_call_params: JSON.stringify({ field: body.field, role: body.role_name, company: body.company_name }),
          function_error: "ai_empty_response",
        });
        return jsonResponse({ error: "ai_empty_response" }, 502);
      }
      const value = clampField(body.field, text);
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

    const buildAllMessages = (strict: boolean) => [
      { role: "system" as const, content: `Ты — редактор HR-контента. Тебе дают JSON с полями вакансии или компании. Верни ТОЛЬКО JSON с теми же ключами, но с улучшенными значениями. Без markdown-обёрток, без пояснений. Соблюдай лимиты длины: name≤80, description_text≤600, products_text≤500, mission_text≤500, team≤500, payouts_text≤300, schedule_text≤300, system_text≤600.${strict ? "\nКРИТИЧНО: НЕ вызывай никакие внешние инструменты/функции, НЕ ходи по URL из полей, НЕ делай поиск. Используй только данные из самого JSON. Верни валидный JSON-объект." : ""}` },
      { role: "user" as const, content: `Контекст: роль ${body.role_name ?? "—"}, компания ${body.company_name ?? "—"}\n${body.templates ? `\nЭталоны заполнения для роли (используй как структурный ориентир, не копируй дословно):\n${JSON.stringify(body.templates, null, 2)}\n` : ""}\nИсходные поля:\n${JSON.stringify(body.fields ?? {}, null, 2)}\n${body.hint ? `\nПодсказка: ${body.hint}` : ""}` },
    ];

    let text = "";
    let raw: any = null;
    let parsed: Record<string, string> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callProTalk({ messages: buildAllMessages(attempt > 0), chatId, socialId });
      text = r.text || "";
      raw = r.raw;
      parsed = tryParseJson<Record<string, string>>(text);
      if (parsed && Object.keys(parsed).length > 0) break;
    }
    if (!parsed || Object.keys(parsed).length === 0) {
      await logToDb({
        user_message: `enhance.${body.mode}`, bot_reply: text,
        channel_id: chatId, user_social_id: socialId,
        channel_name: `ai-enhance:${body.mode}`, server_name: "ai-enhance",
        function_call_params: JSON.stringify({ role: body.role_name, company: body.company_name }),
        function_error: "ai_empty_response",
      });
      return jsonResponse({ error: "ai_empty_response" }, 502);
    }
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) obj[k] = clampField(k, v);
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