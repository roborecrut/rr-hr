// Animated waiting phrases for AI calls, grouped by entity context.
export type LoadingEntity = "company" | "vacancy" | "training" | "generic";

export const LOADING_PHRASES: Record<LoadingEntity, string[]> = {
  company: [
    "Изучаю миссию компании…",
    "Считаю команду и сотрудников…",
    "Разбираю продукты и услуги…",
    "Анализирую график и условия…",
    "Извлекаю систему мотивации…",
    "Формирую описание компании…",
    "Подбираю ключевые цифры…",
  ],
  vacancy: [
    "Анализирую обязанности…",
    "Подбираю требования к кандидату…",
    "Считаю мотивацию и выплаты…",
    "Формирую условия работы…",
    "Готовлю описание роли…",
    "Извлекаю задачи и KPI…",
    "Собираю воронку обучения…",
  ],
  training: [
    "Готовлю учебный материал…",
    "Структурирую разделы курса…",
    "Подбираю примеры и кейсы…",
    "Формирую чек-листы…",
    "Готовлю вопросы для теста…",
    "Считаю баллы и проходной балл…",
    "Оформляю материал в Markdown…",
  ],
  generic: [
    "Думаю…",
    "Обрабатываю запрос…",
    "Готовлю ответ…",
    "Сверяю детали…",
  ],
};

export function pickPhrase(entity: LoadingEntity, idx: number): string {
  const arr = LOADING_PHRASES[entity] || LOADING_PHRASES.generic;
  return arr[idx % arr.length];
}