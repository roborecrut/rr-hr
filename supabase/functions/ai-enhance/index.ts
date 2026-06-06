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
  payouts_text: 500,
  salaryTerms: 300,
  schedule_text: 400,
  scheduleTerms: 300,
  system_text: 1000,
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
  vacancy_text: 1200,
  vacancyText: 1200,
  tasks_activity_text: 1200,
  tasksActivityText: 1200,
  motivation_text: 300,
  motivationText: 300,
  motivation_text_detail: 1000,
  motivationTextDetail: 1000,
  onboarding_text: 1200,
  onboardingText: 1200,
  team_text_vac: 1000,
  system_text_vac: 1000,
  training_professional_text: 1500,
  training_product_text: 1500,
  training_systems_text: 1500,
  training_wiki_text: 600,
  training_regulations_text: 800,
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
    /** Raw extracted text from uploaded file (≤5000 chars). */
    file_context?: string;
    /** Existing company data to seed shared fields (schedule/motivation/team/etc). */
    company_context?: Record<string, any>;
  };
  if (!body?.mode) return jsonResponse({ error: "bad_body" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  try {
    if (body.mode === "single") {
      const limit = LIMITS[body.field ?? ""] ?? 600;
      const buildSingleMessages = (strict: boolean) => [
        {
          role: "system" as const,
          content:
`Ты — старший HR-копирайтер. Переписываешь СТРОГО ОДНО поле «${body.field}» в продающем, чётком, человеческом стиле для лендинга вакансии/компании на русском языке.

ПРАВИЛА ОТВЕТА:
1. Верни ТОЛЬКО готовый текст этого поля. Никаких пояснений, JSON, markdown-обёрток, кавычек вокруг, заголовков.
2. Жёсткий лимит — не длиннее ${limit} символов.
3. Сохраняй формат поля: списки начинаются с «• », теги в квадратных скобках «[Тег] описание», эмодзи там, где это уместно по эталону.
4. Никаких выдуманных цифр, ссылок, дат и имён. Если данных нет — пиши обобщённо, но конкретно.
5. НЕ копируй эталон дословно — используй его только как образец структуры/тона.
6. НЕ вызывай внешние инструменты, не ходи по URL, не делай поиск. Отвечай сразу.${strict ? "\n7. Если был соблазн вызвать инструмент — игнорируй, верни просто текст." : ""}`,
        },
        {
          role: "user" as const,
          content:
`Поле: ${body.field}
Роль (вакансия): ${body.role_name ?? "—"}
Компания: ${body.company_name ?? "—"}
${body.template ? `\nЭТАЛОН ФОРМАТА (только структура, не копировать дословно):\n${body.template}\n` : ""}
Текущее значение поля от пользователя:
"""
${body.value ?? ""}
"""
${body.hint ? `\nДополнительный контекст: ${body.hint}` : ""}

Перепиши значение поля «${body.field}» в продающем, лаконичном виде с сохранением формата. Верни ТОЛЬКО новый текст этого поля.`,
        },
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

    const buildAllMessages = (strict: boolean) => {
      if (body.mode === "all_vacancy") return buildVacancyMessages(body, strict);
      return buildCompanyMessages(body, strict);
    };

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