/**
 * Canonical 15-field vacancy schema.
 *
 * Single source of truth used by:
 *  - VacancyEditor / VacancyWizard (form layout, default placeholders, AI prompts)
 *  - JobVacancyLanding / VacancySections (rendering)
 *  - ai-enhance edge function (formatExample passed in payload.fields_meta)
 *
 * Field key === DB column name on `public.projects` (and `public.training_blocks`
 * where applicable). Keep these keys stable.
 */

export type VacancyField = {
  /** DB column name. */
  key: VacancyFieldKey;
  /** UI label shown above the textarea and as section heading on the landing. */
  label: string;
  /** Short hint shown under the label. */
  hint: string;
  /** Multi-line text? Single-line uses <Input>. */
  multiline: boolean;
  /** Default rows for textarea. */
  rows?: number;
  /** Max length (chars). */
  max?: number;
  /** Placeholder = canonical format example, also sent to AI as formatExample. */
  example: string;
  /**
   * Which renderer to use for the live preview.
   * See `renderFieldPreview` in `VacancyEditor.tsx`.
   */
  preview: "plain" | "bullets" | "bullets-tagged" | "stages" | "schedule" | "payouts";
  /** Which group/tab the field belongs to in the editor. */
  group: "main" | "motivation" | "team" | "training";
};

export type VacancyFieldKey =
  | "role_name"
  | "vacancy_text"
  | "tasks_activity_text"
  | "schedule_text"
  | "motivation_text"
  | "motivation_text_detail"
  | "payouts_text"
  | "onboarding_text"
  | "team_text_vac"
  | "system_text_vac"
  | "training_professional_text"
  | "training_product_text"
  | "training_systems_text"
  | "training_wiki_text"
  | "training_regulations_text";

export const VACANCY_FIELDS: VacancyField[] = [
  {
    key: "role_name",
    label: "Должность",
    hint: "Короткое название должности, как в job-каталогах.",
    multiline: false,
    max: 120,
    example: "Менеджер по продажам",
    preview: "plain",
    group: "main",
  },
  {
    key: "vacancy_text",
    label: "Что нужно от кандидата (требования)",
    hint: "Каждое требование — отдельной строкой, начинается с «•».",
    multiline: true,
    rows: 5,
    max: 1200,
    example:
      "• Ведение переговоров с клиентами по готовой базе\n• Уверенный пользователь ПК и CRM\n• Грамотная устная и письменная речь\n• Готовность работать по чётким регламентам\n• Опыт в смежных продажах — преимущество",
    preview: "bullets",
    group: "main",
  },
  {
    key: "tasks_activity_text",
    label: "Задачи / ежедневная активность",
    hint: "Каждая задача в формате: [эмодзи Название] Описание.",
    multiline: true,
    rows: 5,
    max: 1200,
    example:
      "• [📞 Консультация] Открыть карточку клиента, провести диалог по сценарию, направить ссылку на тариф\n• [📝 Ведение CRM] Зафиксировать итог звонка, обновить статус сделки, поставить задачу-напоминание\n• [🤝 Возражения] Снять типовые возражения по скрипту, передать сложные кейсы РОПу",
    preview: "bullets-tagged",
    group: "main",
  },
  {
    key: "schedule_text",
    label: "График работы",
    hint: "Короткий блок: режим + опорные точки недели.",
    multiline: true,
    rows: 3,
    max: 400,
    example:
      "5/2, 09:00–18:00 МСК. Гибрид: 3 дня офис / 2 дня удалёнка.\nПонедельник — общий созвон команды 10:00.\nПятница — короткий день до 16:00.",
    preview: "schedule",
    group: "main",
  },
  {
    key: "motivation_text",
    label: "Мотивация — коротко (для баннера)",
    hint: "Одно-два предложения для верхнего блока лендинга.",
    multiline: true,
    rows: 2,
    max: 300,
    example:
      "Прозрачная мотивация: оклад + % с продаж без потолка. Обучение за счёт компании, гибкий график, дружная команда.",
    preview: "plain",
    group: "motivation",
  },
  {
    key: "motivation_text_detail",
    label: "Мотивация — детально (бонусы и плюшки)",
    hint: "Каждый бонус — отдельной строкой с «•».",
    multiline: true,
    rows: 5,
    max: 1000,
    example:
      "• Премии до 30% от оклада за выполнение KPI\n• Еженедельные выплаты бонусной части\n• Компенсация мобильной связи и интернета\n• Корпоративный английский / профильные курсы\n• Карьерный рост: Junior → Senior → Team Lead за 12–18 мес.",
    preview: "bullets",
    group: "motivation",
  },
  {
    key: "payouts_text",
    label: "Оплата и схема выплат",
    hint: "Сумма / диапазон + сроки и форма оформления.",
    multiline: true,
    rows: 3,
    max: 500,
    example:
      "Оклад 60 000 ₽ + % с продаж (средний доход 120 000–180 000 ₽).\nВыплаты 5 и 20 числа на карту любого банка. Оформление по ТК РФ / самозанятость / ИП.",
    preview: "payouts",
    group: "motivation",
  },
  {
    key: "onboarding_text",
    label: "Этапы онбординга",
    hint: "Каждый этап в формате: [эмодзи Название] Описание.",
    multiline: true,
    rows: 6,
    max: 1200,
    example:
      "• [📝 Интервью] ИИ-собеседование за 10 минут\n• [📚 Кейс-тест] Проверка базовых навыков и мотивации\n• [🤖 Обучение] Курс из 3 блоков с тестами и симуляциями\n• [🤝 Стажировка] Первые 5 звонков с куратором\n• [✍️ Оформление] ТК РФ / самозанятость / ИП / ГПХ — на выбор",
    preview: "stages",
    group: "motivation",
  },
  {
    key: "team_text_vac",
    label: "Команда вакансии",
    hint: "Каждый член команды в формате: [Роль] Имя — описание.",
    multiline: true,
    rows: 5,
    max: 1000,
    example:
      "• [Продажи] Иван — РОП, 7 лет в B2B\n• [Маркетинг] Мария — таргетолог, лиды на стол\n• [Аналитика] Дмитрий — следит за конверсией каждого этапа\n• [HR] Анна — поможет с адаптацией",
    preview: "bullets-tagged",
    group: "team",
  },
  {
    key: "system_text_vac",
    label: "Системы и регламенты вакансии",
    hint: "Каждый инструмент в формате: [Тип] Название — правила использования.",
    multiline: true,
    rows: 5,
    max: 1000,
    example:
      "• [CRM] Bitrix24 — обязательное заполнение карточек после каждого контакта\n• [Связь] Telegram-каналы отдела, Zoom для созвонов\n• [Регламенты] База знаний в Notion, обновляется еженедельно\n• [Отчётность] Ежедневный план/факт до 20:30 МСК",
    preview: "bullets-tagged",
    group: "team",
  },
  {
    key: "training_professional_text",
    label: "Обучение — профессия",
    hint: "Список уроков по профессии. Каждый урок — отдельной строкой.",
    multiline: true,
    rows: 6,
    max: 1500,
    example:
      "• Урок 1: Профессия — кто наш клиент, зачем мы нужны, как устроен рынок\n• Урок 2: Сценарий первого контакта (скрипт + 5 ситуаций)\n• Урок 3: Работа с возражениями (топ-10 типовых)\n• Урок 4: Закрытие сделки и пост-продажное сопровождение\n• Тест: 10 вопросов с автопроверкой",
    preview: "bullets",
    group: "training",
  },
  {
    key: "training_product_text",
    label: "Обучение — продукт",
    hint: "Список уроков по продукту/услуге компании.",
    multiline: true,
    rows: 6,
    max: 1500,
    example:
      "• Линейка тарифов / услуг — что входит, чем отличаются\n• УТП и преимущества против 3 главных конкурентов\n• Кейсы клиентов с цифрами (до/после)\n• Демо-доступ к продукту: 30-минутный туториал\n• Тест: 8 вопросов, нужно 7/8 для прохождения",
    preview: "bullets",
    group: "training",
  },
  {
    key: "training_systems_text",
    label: "Обучение — системы и процессы",
    hint: "Список уроков по внутренним системам и процессам.",
    multiline: true,
    rows: 6,
    max: 1500,
    example:
      "• CRM Bitrix24: как создать карточку, обновить статус, поставить задачу\n• Telegram-каналы команды и правила переписки\n• Регламент ежедневной отчётности (форма + дедлайн 20:30 МСК)\n• Эскалация: когда и кому передавать сложные кейсы\n• Финальный кейс: пройти полный цикл сделки в учебной среде",
    preview: "bullets",
    group: "training",
  },
  {
    key: "training_wiki_text",
    label: "База знаний (Wiki)",
    hint: "Где лежит база знаний и как ей пользоваться.",
    multiline: true,
    rows: 3,
    max: 600,
    example:
      "База знаний в Notion: ссылки на скрипты, шаблоны писем, регламенты, FAQ. Обновляется руководителем еженедельно. Доступ — через корпоративный SSO.",
    preview: "plain",
    group: "training",
  },
  {
    key: "training_regulations_text",
    label: "Регламенты",
    hint: "Ключевые правила рабочего распорядка — построчно.",
    multiline: true,
    rows: 4,
    max: 800,
    example:
      "• Рабочее время: 09:00–18:00 МСК, обед 13:00–14:00\n• Дресс-код: smart casual на встречах с клиентами\n• Отчётность: до 20:30 МСК ежедневно\n• Отпуск: 28 дней по согласованию с РОП за 14 дней",
    preview: "bullets",
    group: "training",
  },
];

export const VACANCY_FIELDS_BY_KEY: Record<VacancyFieldKey, VacancyField> =
  VACANCY_FIELDS.reduce((acc, f) => {
    acc[f.key] = f;
    return acc;
  }, {} as Record<VacancyFieldKey, VacancyField>);

export const VACANCY_FIELD_GROUPS: { id: VacancyField["group"]; label: string }[] = [
  { id: "main", label: "Основное" },
  { id: "motivation", label: "Мотивация и оплата" },
  { id: "team", label: "Команда и системы" },
  { id: "training", label: "Обучение и регламенты" },
];

/** Build a `formatExamples` payload to send to the `ai-enhance` edge function. */
export function buildFormatExamples(): Record<VacancyFieldKey, string> {
  const out = {} as Record<VacancyFieldKey, string>;
  for (const f of VACANCY_FIELDS) out[f.key] = f.example;
  return out;
}