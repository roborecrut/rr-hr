import { supabase } from "@/integrations/supabase/client";

/**
 * Field examples shown next to each input in the Vacancy & Training wizards.
 * These are also pre-filled into empty fields and passed to the AI as the
 * "эталон заполнения" for the chosen role.
 *
 * A role-specific override is fetched from `job_titles.field_templates` (DB),
 * and falls back to these generic defaults if the role has no override.
 */

export type VacancyTemplate = Partial<Record<VacancyFieldKey, string>>;

export type VacancyFieldKey =
  | "vacancy_text"
  | "tasks_activity_text"
  | "schedule_text"
  | "motivation_text"
  | "motivation_text_detail"
  | "payouts_text"
  | "onboarding_text"
  | "team_text_vac"
  | "system_text_vac";

export const DEFAULT_VAC_TEMPLATES: Record<VacancyFieldKey, string> = {
  vacancy_text:
    "• Ведение переговоров с клиентами по готовой базе\n• Уверенный пользователь ПК и CRM\n• Грамотная устная и письменная речь\n• Готовность работать по чётким регламентам\n• Опыт в смежных продажах — преимущество",
  tasks_activity_text:
    "• [📞 Консультация] Открыть карточку клиента, провести диалог по сценарию, направить ссылку на тариф\n• [📝 Ведение CRM] Зафиксировать итог звонка, обновить статус сделки, поставить задачу-напоминание\n• [🤝 Возражения] Снять типовые возражения по скрипту, передать сложные кейсы РОПу",
  schedule_text:
    "5/2, 09:00–18:00 МСК. Гибрид: 3 дня офис / 2 дня удалёнка.\nПонедельник — общий созвон команды 10:00.\nПятница — короткий день до 16:00.",
  motivation_text:
    "Прозрачная мотивация: оклад + % с продаж без потолка. Обучение за счёт компании, гибкий график, дружная команда и понятная карьерная лестница.",
  motivation_text_detail:
    "• Премии до 30% от оклада за выполнение KPI\n• Еженедельные выплаты бонусной части\n• Компенсация мобильной связи и интернета\n• Корпоративный английский / профильные курсы\n• Карьерный рост: Junior → Senior → Team Lead за 12–18 мес.",
  payouts_text:
    "Оклад 60 000 ₽ + % с продаж (средний доход 120 000–180 000 ₽).\nВыплаты 5 и 20 числа на карту любого банка. Оформление по ТК РФ / самозанятость / ИП.",
  onboarding_text:
    "• [📝 Интервью] ИИ-собеседование за 10 минут\n• [📚 Кейс-тест] Проверка базовых навыков и мотивации\n• [🤖 Обучение] Курс из 3 блоков с тестами и симуляциями\n• [🤝 Стажировка] Первые 5 звонков с куратором\n• [✍️ Оформление] ТК РФ / самозанятость / ИП / ГПХ — на выбор",
  team_text_vac:
    "• [Продажи] Иван — РОП, 7 лет в B2B\n• [Маркетинг] Мария — таргетолог, лиды на стол\n• [Аналитика] Дмитрий — следит за конверсией каждого этапа\n• [HR] Анна — поможет с адаптацией",
  system_text_vac:
    "• [CRM] Bitrix24 — обязательное заполнение карточек после каждого контакта\n• [Связь] Telegram-каналы отдела, Zoom для созвонов\n• [Регламенты] База знаний в Notion, обновляется еженедельно\n• [Отчётность] Ежедневный план/факт до 20:30 МСК",
};

export type TrainingFieldKey =
  | "training_intro_text"
  | "training_prof_text"
  | "training_product_text"
  | "training_system_text"
  | "training_wiki_text"
  | "training_regulations_text";

export const DEFAULT_TRAINING_TEMPLATES: Record<TrainingFieldKey, string> = {
  training_intro_text:
    "Курс адаптации для новых сотрудников на позицию. Цель — за 5 рабочих дней довести стажёра до самостоятельного выполнения базовых задач: первый звонок, первая сделка, корректная отчётность.",
  training_prof_text:
    "• Урок 1: Профессия — кто наш клиент, зачем мы нужны, как устроен рынок\n• Урок 2: Сценарий первого контакта (скрипт + 5 ситуаций)\n• Урок 3: Работа с возражениями (топ-10 типовых)\n• Урок 4: Закрытие сделки и пост-продажное сопровождение\n• Тест: 10 вопросов с автопроверкой",
  training_product_text:
    "• Линейка тарифов / услуг — что входит, чем отличаются\n• УТП и преимущества против 3 главных конкурентов\n• Кейсы клиентов с цифрами (до/после)\n• Демо-доступ к продукту: 30-минутный туториал\n• Тест: 8 вопросов, нужно 7/8 для прохождения",
  training_system_text:
    "• CRM Bitrix24: как создать карточку, обновить статус, поставить задачу\n• Telegram-каналы команды и правила переписки\n• Регламент ежедневной отчётности (форма + дедлайн 20:30 МСК)\n• Эскалация: когда и кому передавать сложные кейсы\n• Финальный кейс: пройти полный цикл сделки в учебной среде",
  training_wiki_text:
    "База знаний в Notion: ссылки на скрипты, шаблоны писем, регламенты, FAQ. Обновляется руководителем еженедельно. Доступ — через корпоративный SSO.",
  training_regulations_text:
    "• Рабочее время: 09:00–18:00 МСК, обед 13:00–14:00\n• Дресс-код: smart casual на встречах с клиентами\n• Отчётность: до 20:30 МСК ежедневно\n• Отпуск: 28 дней по согласованию с РОП за 14 дней",
};

const cache = new Map<string, VacancyTemplate & Partial<Record<TrainingFieldKey, string>>>();

export async function getRoleTemplates(role: string): Promise<VacancyTemplate & Partial<Record<TrainingFieldKey, string>>> {
  const norm = (role || "").trim().toLowerCase();
  if (!norm) return {};
  if (cache.has(norm)) return cache.get(norm)!;
  try {
    const { data } = await supabase.rpc("job_title_get_templates" as any, { _title: role });
    const obj = (data && typeof data === "object" ? data : {}) as Record<string, string>;
    cache.set(norm, obj);
    return obj;
  } catch {
    return {};
  }
}

export function mergedTemplate<T extends string>(
  field: T,
  roleTemplates: Record<string, string>,
  defaults: Record<string, string>,
): string {
  const fromRole = (roleTemplates?.[field] || "").trim();
  if (fromRole) return fromRole;
  return (defaults?.[field] || "").trim();
}

export async function saveRoleTemplates(
  role: string,
  patch: Record<string, string>,
): Promise<void> {
  const r = (role || "").trim();
  if (!r) return;
  // Strip empty values so we don't overwrite with blanks.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && v.trim()) clean[k] = v.trim();
  }
  if (!Object.keys(clean).length) return;
  try {
    await supabase.rpc("job_title_save_templates" as any, { _title: r, _patch: clean });
    cache.delete(r.toLowerCase());
  } catch (err) {
    console.warn("saveRoleTemplates failed", err);
  }
}

export function invalidateTemplatesCache() {
  cache.clear();
}