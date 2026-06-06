# Финал Итерации 3 — Конструктор обучения и поэтапное прохождение

## 1. Модель обучения: 3 последовательных этапа

Курс обучения = ровно 3 этапа, идут строго по очереди:

1. **Профессиональное обучение** (`stage = 'professional'`) — все модули по навыкам/обязанностям + 1 общий тест по всем модулям этапа.
2. **Продуктовое обучение** (`stage = 'product'`) — модули по продуктам/услугам компании + тест.
3. **Системное обучение** (`stage = 'system'`) — регламенты, CRM, условия работы (объединяет system/wiki/regulations) + тест.

Кандидат не видит этап N+1, пока не сдал тест этапа N. Тест можно перепроходить **неограниченное число раз** до набора `pass_score` (по умолчанию 70/100).

## 2. Изменения в БД (миграция)

Добавляем поле `stage` в `training_blocks`:
- `stage text not null default 'professional'` со значениями `professional|product|system`.
- Один блок = один модуль (несколько модулей на этап разрешены).
- `materials_md` — учебный материал модуля (Markdown, ≤10 000 симв), оформлен ИИ, редактируется человеком.
- Существующие `pass_score` (70), `total_score` оставляем.

Тест хранится **на этап**, а не на модуль. Создаём `training_stage_tests`:
```
id uuid pk
project_id uuid → projects
stage text ('professional'|'product'|'system')
questions jsonb  -- массив вопросов с correct/expected_answer (для бэкенда)
pass_score int default 70
total_score int default 100
ai_generated_at timestamptz
unique(project_id, stage)
```

Прогресс кандидата по этапу: `candidate_stage_progress`:
```
candidate_id uuid, stage text, attempts int default 0,
best_score int, passed_at timestamptz, last_answers jsonb,
pk (candidate_id, stage)
```

GRANTs: `authenticated` — select/insert/update/delete своих строк; `service_role` — all. RLS: владелец вакансии (employer) видит/правит `training_stage_tests`; кандидат видит только вопросы своего проекта (без `correct/expected_answer` — фильтруется на сервере).

## 3. Edge Functions

### `ai-generate-stage-material` (обновление существующего ai-generate-training-material)
Вход: `{ project_id, stage }`. Собирает **весь контекст этапа**:
- вакансия: role_name, responsibilities, requirements, conditions, motivation;
- компания (для product/system): description_text, products_text, mission_text, system_text, payouts_text, schedule_text;
- ранее сохранённые `training_*_text` поля;
- доп. источник из `DocumentIngestField` (опционально).

Возвращает Markdown-материал 1500–3000 слов, сохраняет в `training_blocks` (создаёт модули по разделам H2). Первичка делается ИИ; человек редактирует.

### `ai-generate-stage-test` (новый, заменяет ai-generate-training-quiz)
Вход: `{ project_id, stage }`. Берёт **все `materials_md` модулей этапа** и склеивает.
Просит ИИ сгенерить 20 вопросов (10 choice с уклоном в негативные формулировки + 10 text). Сохраняет в `training_stage_tests.questions` с полями `correct` / `expected_answer` — они нужны позже для проверки.

### `ai-check-stage-answers` (обновление ai-check-text-answer)
Вход: `{ candidate_id, stage, answers: [{question_id, value}] }`. Серверно:
- choice: сравнивает с `correct` локально (5 баллов).
- text: для каждого вопроса вызывает ProTalk и **передаёт в промпт эталонный `expected_answer`** + ответ кандидата, просит вернуть 0–5 баллов и краткий комментарий.
- Суммирует, обновляет `candidate_stage_progress` (attempts++, best_score, passed_at если ≥ pass_score), возвращает `{ score, passed, per_question }`.

### `ai-list-stage-questions` (новый, read-only для кандидата)
Возвращает вопросы этапа БЕЗ `correct`/`expected_answer`. Используется в кабинете кандидата.

Все функции — `verify_jwt = false`, валидируют JWT/сессию в коде.

## 4. Фронтенд

### Работодатель: `TrainingWizard` — переписать на 3 вкладки этапов
Для каждого этапа:
- `DocumentIngestField` (entity=`training`, stage в payload) — загрузка материалов;
- кнопка **«Оформить материалы ИИ»** → `ai-generate-stage-material` → показывает `LoadingPhrase` с фразами по обучению;
- список модулей этапа: каждый — заголовок + Markdown-редактор (textarea + `react-markdown` preview, 10 000 симв);
- кнопка **«Сгенерировать тест ИИ»** → `ai-generate-stage-test`;
- список вопросов теста с возможностью отредактировать формулировку, варианты и эталон (видно только работодателю).
- Сохранение по кнопке (upsert модулей и теста).

### Кандидат: `CandidateFlow` → новая вкладка «📚 Обучение»
- Прогресс-бар по 3 этапам.
- Текущий этап: вывод модулей через `react-markdown`, кнопка «Перейти к тесту» появляется после прочтения.
- Тест: рендер 20 вопросов, отправка ответов в `ai-check-stage-answers`.
- Если `score < pass_score` — сообщение «Не сдан, попробуй ещё раз», кнопка «Перепройти тест» (без лимита попыток).
- Если сдан — открывается следующий этап; если все 3 сданы — `training_completed_at` на кандидате.

## 5. Технические детали (для разработчика)

- Миграция: `add column stage`, новые таблицы + GRANTs + RLS + индексы `(project_id, stage)`, `(candidate_id, stage)`.
- `src/integrations/supabase/types.ts` обновится автоматически.
- Markdown: уже добавлены `react-markdown` + `remark-gfm`.
- Подсказки `LoadingPhrase` для `training` уже есть (`src/lib/loadingPhrases.ts`) — расширить фразами «Готовлю модули профессии…», «Составляю тест по продукту…», «Проверяю ответы…».
- При проверке текстовых ответов промпт ProTalk:
  ```
  Эталон: {expected_answer}
  Ответ кандидата: {value}
  Оцени от 0 до 5 баллов по смысловому совпадению с эталоном. Верни JSON {"score":N,"comment":"..."}.
  ```
- `correct`/`expected_answer` НИКОГДА не отдаются на клиент кандидата (фильтр в `ai-list-stage-questions`).
- Старый `ai-generate-training-quiz` и `training_questions` оставляем как legacy; новые этапные тесты идут через `training_stage_tests`.

## Порядок выполнения
1. Миграция БД (этап + новые таблицы + GRANT/RLS).
2. 4 edge-функции (material, test, check, list).
3. Перепись `TrainingWizard` на 3 этапа.
4. Вкладка «Обучение» в `CandidateFlow` с поэтапной разблокировкой.
5. Smoke-тест через curl: материалы → тест → проверка ответов с пересдачей.
