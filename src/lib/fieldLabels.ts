/**
 * Карта English → Русское название поля для отображения в заголовке оверлея
 * ожидания ИИ (улучшение поля, генерация и т.п.). Покрывает компании,
 * вакансии, обучение, интервью. Если ключа нет в карте — возвращаем как есть.
 */
export const FIELD_LABELS_RU: Record<string, string> = {
  // company
  name: "Название компании",
  industry: "Сфера деятельности",
  staff: "Численность сотрудников",
  description: "Описание компании",
  descriptionText: "Описание компании",
  sites: "Сайт компании",
  logoUrl: "Логотип",
  missionText: "Миссия компании",
  customWiki: "Пользовательская вики",
  salaryTerms: "Условия оплаты",
  scheduleTerms: "График работы",
  statsValClients: "Значение: клиенты",
  statsLabelClients: "Подпись: клиенты",
  statsValDialogs: "Значение: диалоги",
  statsLabelDialogs: "Подпись: диалоги",
  statsValFounded: "Год основания",
  statsLabelFounded: "Подпись: основание",
  productsText: "Продукты компании",

  // vacancy
  role_name: "Название должности",
  vacancy_text: "Описание вакансии",
  tasks_activity_text: "Задачи и обязанности",
  schedule_text: "График работы",
  motivation_text: "Мотивация",
  motivation_text_detail: "Детали мотивации",
  payouts_text: "Выплаты",
  onboarding_text: "Адаптация",
  team_text: "Команда",
  system_text: "Система работы",
  training_professional_text: "Профессиональное обучение",
  training_product_text: "Продуктовое обучение",
  training_systems_text: "Обучение системам",
  training_wiki_text: "База знаний",
  training_regulations_text: "Регламенты",

  // training
  checklistQuestions: "Вопросы чек-листа",
  roleplayQuestions: "Ситуации (ролевые)",
  trainingMaterial: "Учебные материалы",
  trainingQuiz: "Тест по обучению",

  // interview
  interviewChecklist: "Чек-лист интервью",
  interviewSituations: "Ситуации интервью",
  interviewResumeCriteria: "Критерии резюме",
};

export function ruField(key?: string | null): string {
  if (!key) return "";
  return FIELD_LABELS_RU[key] || key;
}