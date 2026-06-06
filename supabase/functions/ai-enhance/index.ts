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
  team_text: 1000,
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

// ---------------------------------------------------------------------------
// Vacancy: full 15-field beautifier
// ---------------------------------------------------------------------------

const VACANCY_EXAMPLE = `{
  "role_name": "Няня для ребёнка 3 лет",
  "vacancy_text": "• Опыт ухода за детьми дошкольного возраста от 2 лет\n• Базовая педагогическая подготовка (курсы, училище или ВУЗ)\n• Знание правил оказания первой помощи\n• Аккуратность, пунктуальность, некурящая\n• Готовность работать в режиме 5/2 в семье",
  "tasks_activity_text": "• [🧸 Развитие] Лепка, рисование, чтение сказок по возрасту\n• [🌳 Прогулка] Активные игры на площадке, контроль безопасности\n• [🍲 Быт] Приготовление простой еды, мытьё детской посуды\n• [😴 Режим] Укладывание на дневной сон, соблюдение тишины",
  "schedule_text": "5/2, 08:00–19:00. Работа в семье.\nВозможны редкие вечерние выходы родителей (оплачиваются дополнительно).",
  "motivation_text": "Стабильная зарплата, официальное оформление, оплачиваемый отпуск и больничный. Комфортные условия в частном доме.",
  "motivation_text_detail": "• Премия за отсутствие больничных у ребёнка\n• Оплата проезда до места работы\n• Подарки к праздникам от семьи\n• Возможность брать дополнительные смены в выходные\n• Дружелюбная атмосфера и уважение к труду",
  "payouts_text": "Оклад 60 000 ₽ + премии за переработки (средний доход 70 000–85 000 ₽).\nВыплаты 2 раза в месяц на карту. Оформление по ТК РФ или ГПХ.",
  "onboarding_text": "• [📝 Интервью] ИИ-собеседование за 10 минут\n• [📚 Кейс-тест] Проверка базовых навыков и мотивации\n• [🤖 Обучение] Курс из 3 блоков с тестами и симуляциями\n• [🤝 Стажировка] 3 пробных дня с ребёнком под наблюдением мамы\n• [✍️ Оформление] ТК РФ / самозанятость / ИП / ГПХ — на выбор",
  "team_text": "• [Мама] Анна — утверждает режим и меню\n• [Папа] Дмитрий — помогает с выходными днями\n• [Домработница] Елена — помогает с уборкой общих зон",
  "system_text": "• [Связь] WhatsApp для ежедневных фотоотчётов\n• [Расписание] Google Calendar для планирования кружков\n• [Здоровье] Электронная медкарта ребёнка",
  "training_professional_text": "• Урок 1: Возрастная психология детей 3–4 лет\n• Урок 2: Первая помощь при травмах и удушье\n• Урок 3: Развивающие методики без гаджетов\n• Урок 4: Как действовать в чрезвычайных ситуациях\n• Тест: знание алгоритма действий при температуре",
  "training_product_text": "• Особенности характера и предпочтения ребёнка\n• Аллергии и ограничения в питании\n• Любимые игрушки и мультфильмы\n• Маршруты безопасных прогулок рядом с домом",
  "training_systems_text": "• Отправка фотоотчётов в WhatsApp каждые 3 часа\n• Ведение дневника питания и сна\n• Использование таймера для контроля времени занятий",
  "training_wiki_text": "Памятка для няни: распорядок дня, список разрешённых продуктов, контакты врачей, правила безопасности в доме.",
  "training_regulations_text": "• Запрет на использование телефона во время активных игр\n• Нельзя оставлять ребёнка одного ни на минуту\n• Согласование новых продуктов с мамой\n• Соблюдение конфиденциальности жизни семьи"
}`;

function buildVacancyMessages(body: any, strict: boolean) {
  const company = body.company_context && Object.keys(body.company_context).length > 0
    ? JSON.stringify(body.company_context, null, 2)
    : "";
  const file = (body.file_context || "").slice(0, 5000);

  const system =
`Ты — старший HR-копирайтер. Тебе дают:
 • уже частично заполненные 15 полей вакансии (JSON),
 • данные компании (JSON, для согласованности по графику / мотивации / команде / системам),
 • необязательно — распознанный текст из загруженного документа о вакансии (до 5000 символов).

ТВОЯ ЗАДАЧА: вернуть СТРОГО ОДИН JSON-объект с РОВНО следующими 15 ключами:
role_name, vacancy_text, tasks_activity_text, schedule_text, motivation_text, motivation_text_detail, payouts_text, onboarding_text, team_text, system_text, training_professional_text, training_product_text, training_systems_text, training_wiki_text, training_regulations_text.

ЖЁСТКИЕ ПРАВИЛА:
1. Ответ — ТОЛЬКО валидный JSON, без markdown-обёрток, без пояснений до или после.
2. Никаких лишних ключей. Никаких null — для каждого ключа должна быть осмысленная строка.
3. Если по какому-то полю у пользователя пусто, опираясь на роль + компанию + текст файла — допиши реалистичный продающий контент в нужном формате. Никаких выдуманных конкретных цифр, ссылок, ФИО — только обобщённые формулировки.
4. Если поле у пользователя уже заполнено — сохрани смысл, только улучши формулировки, форматирование и стиль.
5. Используй данные компании как источник истины для пересекающихся блоков: schedule_text, motivation_text, motivation_text_detail, payouts_text, team_text, system_text — если в компании указан график/мотивация/системы, используй их.
6. Соблюдай ФОРМАТ каждого поля:
   • role_name: короткая строка, без точки.
   • vacancy_text (требования): каждый пункт начинается с «• », отдельной строкой.
   • tasks_activity_text: «• [эмодзи Название] описание» на строке.
   • schedule_text: 1–3 строки, режим + опорные точки недели.
   • motivation_text: одно-два предложения сплошным текстом.
   • motivation_text_detail: «• …» построчно.
   • payouts_text: 1–3 строки, оклад + бонусы + сроки выплат + оформление.
   • team_text, system_text: «• [Тег] …».
   • training_*: «• …» построчно, training_wiki_text — сплошной текст (1–3 предложения).
7. onboarding_text — СТРОГО 5 пунктов в следующем порядке и формате, менять можно ТОЛЬКО текст после «[🤝 Стажировка]»:
   • [📝 Интервью] ИИ-собеседование за 10 минут
   • [📚 Кейс-тест] Проверка базовых навыков и мотивации
   • [🤖 Обучение] Курс из 3 блоков с тестами и симуляциями
   • [🤝 Стажировка] <конкретное описание пробных дней под роль и компанию>
   • [✍️ Оформление] ТК РФ / самозанятость / ИП / ГПХ — на выбор
8. Лимиты длины (в символах): vacancy_text≤1200, tasks_activity_text≤1200, schedule_text≤400, motivation_text≤300, motivation_text_detail≤1000, payouts_text≤500, onboarding_text≤1200, team_text≤1000, system_text≤1000, training_professional_text≤1500, training_product_text≤1500, training_systems_text≤1500, training_wiki_text≤600, training_regulations_text≤800, role_name≤120.
9. НЕ вызывай внешние инструменты, не ходи по URL, не делай поиск. Работай ТОЛЬКО с тем JSON и текстом, что дали.${strict ? "\n10. Если был соблазн вызвать функцию — игнорируй, верни JSON." : ""}

ОБРАЗЕЦ КАЧЕСТВЕННО ЗАПОЛНЕННОГО JSON (структура и тон — использовать как ориентир, не копировать дословно):
${VACANCY_EXAMPLE}`;

  const user =
`Должность: ${body.role_name ?? "—"}
Компания: ${body.company_name ?? "—"}

ИСХОДНЫЕ ПОЛЯ ВАКАНСИИ (что заполнил пользователь):
${JSON.stringify(body.fields ?? {}, null, 2)}
${company ? `\nДАННЫЕ КОМПАНИИ (используй для согласованности):\n${company}\n` : ""}${file ? `\nРАСПОЗНАННЫЙ ТЕКСТ ИЗ ДОКУМЕНТА ВАКАНСИИ (до 5000 символов):\n"""\n${file}\n"""\n` : ""}${body.hint ? `\nДополнительный контекст: ${body.hint}\n` : ""}
Верни ТОЛЬКО JSON со всеми 15 ключами.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ---------------------------------------------------------------------------
// Company: full beautifier
// ---------------------------------------------------------------------------

const COMPANY_EXAMPLE = `{
  "name": "Coffee & Co",
  "industry": "Сеть авторских кофеен",
  "staff": "около 120 человек в 18 точках",
  "sites": "https://coffeeandco.ru",
  "description_text": "Coffee & Co — сеть авторских кофеен в Москве и Санкт-Петербурге. Мы готовим спешелти-кофе, обучаем бариста по собственной академии и развиваем точки на проходных локациях.",
  "products_text": "• Эспрессо-напитки на собственной обжарке\n• Авторские сезонные напитки\n• Завтраки и выпечка от шеф-кондитера\n• Зерно и капсулы для дома",
  "missionText": "Делаем привычный ритуал кофе осмысленным: качество, скорость и забота о госте — каждый день.",
  "team": "• [CEO] Алексей — отвечает за стратегию и рост сети\n• [Operations] Мария — стандарты сервиса и качество\n• [Q-Grader] Илья — обжарка и закупки зерна\n• [HR] Анна — обучение и удержание команды",
  "payouts_text": "Оклад + % от выручки точки. Выплаты 2 раза в месяц. Оформление по ТК РФ или самозанятость.",
  "scheduleTerms": "Сменный график 2/2 по 11 часов, гибкие смены 4–8 ч для студентов.",
  "system_text": "• [POS] iiko — все продажи и инвентаризации\n• [Связь] Telegram-чат точки + общий канал сети\n• [Обучение] LMS «Академия Coffee & Co»\n• [Регламенты] Notion-база с обновлением раз в неделю",
  "customWiki": "Wiki-база Coffee & Co: рецепты, стандарты сервиса, инструкции по оборудованию, FAQ для новичков.",
  "statsValClients": "1.2M",
  "statsLabelClients": "Гостей в год",
  "statsValDialogs": "350",
  "statsLabelDialogs": "Сотрудников",
  "statsValFounded": "2017",
  "statsLabelFounded": "Год основания"
}`;

function buildCompanyMessages(body: any, strict: boolean) {
  const file = (body.file_context || "").slice(0, 5000);
  const system =
`Ты — старший копирайтер бренд-маркетинга. Тебе дают:
 • уже частично заполненные поля карточки компании (JSON),
 • необязательно — распознанный текст из загруженного документа о компании (до 5000 символов).

ТВОЯ ЗАДАЧА: вернуть СТРОГО ОДИН JSON-объект с теми же ключами, что были на входе, с улучшенными значениями.

ЖЁСТКИЕ ПРАВИЛА:
1. Ответ — ТОЛЬКО валидный JSON. Без markdown, без пояснений.
2. Сохраняй СУЩЕСТВУЮЩИЕ ключи входного JSON, никаких новых ключей не добавляй.
3. Если поле пустое — заполни по контексту, без выдуманных цифр/имён/URL.
4. Если поле заполнено — улучшай формулировку, не меняя сути.
5. Соблюдай формат: списки «• …» построчно, теги «[Тег] …», stats* — короткие.
6. Лимиты: name≤80, industry≤80, staff≤80, sites≤200, description_text≤600, products_text≤500, missionText≤500, team≤500, payouts_text≤500, scheduleTerms≤300, system_text≤1000, customWiki≤600, statsVal*≤16, statsLabel*≤40.
7. НЕ вызывай внешние инструменты, не ходи по URL, не делай поиск.${strict ? "\n8. Если был соблазн вызвать функцию — игнорируй, верни JSON." : ""}

ОБРАЗЕЦ (структура и тон — ориентир, не копировать дословно):
${COMPANY_EXAMPLE}`;

  const user =
`Компания: ${body.company_name ?? "—"}

ИСХОДНЫЕ ПОЛЯ КОМПАНИИ:
${JSON.stringify(body.fields ?? {}, null, 2)}
${file ? `\nРАСПОЗНАННЫЙ ТЕКСТ ИЗ ДОКУМЕНТА КОМПАНИИ (до 5000 символов):\n"""\n${file}\n"""\n` : ""}${body.hint ? `\nДополнительный контекст: ${body.hint}\n` : ""}
Верни ТОЛЬКО JSON с теми же ключами, что были на входе.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

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