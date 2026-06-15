# RR Pro Max — Этап 4a (фундамент)

Этот документ — карта серверной AI-архитектуры HR-RR и контракт нового слоя
резервной модели «RR Pro Max». На этапе 4a реальный вызов резервной модели
ещё не выполняется и UI ещё не создан.

## 1. Текущие AI-вызовы (карта)

Все edge-функции, использующие основную модель через
`_shared/protalk.ts → callProTalk()`:

| Edge Function | Тип задачи | System prompt | User prompt / вход | Списание RR | Сохранение | retry / /restart | Frontend |
|---|---|---|---|---|---|---|---|
| `ai-chat` | чат employer/candidate/public | константы в файле | `body.messages` (+ серверный whitelist-context для public) | нет | `logs` | нет | `aiChat()`, `JobVacancyLanding`, `CompanyLanding`, `VacancyAIAssistant` |
| `ai-enhance` | улучшение/расширение полей вакансии/компании | в файле | `fields` + `templates` | нет | возврат на клиент | нет | `aiEnhance*()`, `VacancyEditor` |
| `ai-evaluate` | оценка резюме / чек-листа / ситуаций / тренинга | в файле | `payload` | нет | возврат на клиент | нет | `aiEvaluate()` |
| `ai-company-analyze` | разбор документа компании | в файле | URL/raw_text | нет | возврат на клиент | нет | `aiCompanyAnalyze()` |
| `ai-generate-onboarding` | генерация онбординга по проекту | в файле | `project_id`/brief | нет | `training_blocks`, `interview_blocks` | нет | `aiGenerateOnboarding()` |
| `ai-generate-stage-material`, `-stage-test` | материал/тест этапа | в файле | `project_id, stage` | нет | `training_blocks` | нет | `TrainingWizard` |
| `ai-generate-training-material`, `-training-quiz` | материал/тест тренинга | в файле | `block_id` | нет | `training_blocks`, `training_questions` | нет | `TrainingWizard` |
| `ai-generate-interview-checklist`, `-resume-criteria`, `-situations` | блоки собеседования | в файле | `project_id` | нет | `interview_blocks` | нет | `InterviewWizard` |
| `ai-list-stage-questions`, `ai-list-interview-checklist` | список вопросов | в файле | `project_id` | нет | возврат на клиент | нет | wizards |
| `ai-check-stage-answers`, `ai-check-text-answer` | проверка ответа кандидата | в файле | `candidate_id, answer` | да (косвенно через статус) | `candidate_answers/scores` | нет | `CandidateStageTraining` |
| `ai-interview-screen-resume`, `-grade-checklist`, `-grade-situations` | интервью кандидата | в файле | `candidate_id, ...` | да | `candidate_scores`, `interview_messages` | нет | `CandidateInterview` |
| `ai-distribute-text` | разнос текста по полям | в файле | `text` | нет | возврат | нет | `DocumentIngestField` |
| `ai-ingest-document` | распознавание документа | в файле | signed storage URL | нет | возврат | нет | `DocumentIngestField`, `EmployerPanel`, `CandidateInterview` |
| `ai-faq-assist` | публичный FAQ-бот | в файле | `messages` | нет | возврат | нет | `FaqPage` |
| `ai-restart` | холодный старт ProTalk | — | — | нет | — | сам и есть /restart | `aiRestart()` |

Единый низкоуровневый адаптер уже существует: `_shared/protalk.ts`. На 4b
он будет обёрнут общим интерфейсом `AiProvider` (`_shared/ai-provider.ts`)
как `primary`; параллельно появится `rr_pro_max`. Второго AI-стека не
создаётся.

## 2. AI-job очередь

Таблицы (миграция применена):

- `public.ai_jobs` — одна оплачиваемая задача (job_type, владельцы,
  status, primary_provider, fallback_allowed/used, idempotency_key,
  prompt_version, expected_schema, request_snapshot, result_reference,
  credits_status, timestamps, expires_at).
- `public.ai_job_attempts` — журнал попыток по провайдерам с
  длительностью, safe_error_code и response_validation_status.
- `public.ai_jobs_safe_status` — view без snapshot/безопасный срез для
  frontend; `security_invoker = on`.

Уникальные индексы:
- `(user_id, idempotency_key)` — двойной клик не создаёт второй job.
- `(candidate_id, idempotency_key) where user_id is null` — для
  кандидатских флоу.
- `(job_id, provider) where status = 'started'` — только одна
  параллельная попытка на провайдера.
- `(job_id, provider, attempt_number)` — стабильная нумерация.

### RLS / доступы

- `ai_jobs`, `ai_job_attempts` — `service_role` (edge-функции) пишет всё;
  `authenticated` имеет только SELECT на свои строки (`user_id =
  auth.uid()`); `anon` доступа не имеет.
- `ai_jobs_safe_status` — `authenticated` SELECT, `anon` нет. Полный
  `request_snapshot` НИКОГДА не выдаётся фронтенду.
- Кандидаты (без JWT) читают статус только через edge-функцию, которая
  под service_role проверяет принадлежность по candidate token + job
  candidate_id.

### Машина состояний

```
created
  → primary_running
      → primary_succeeded            (терминал)
      → primary_failed
      → timed_out / validation_failed / save_failed / cancelled
  primary_failed
      → fallback_available           (если fallback_allowed)
          → fallback_restarting
              → fallback_running
          → fallback_running
              → fallback_succeeded   (терминал)
              → fallback_failed      (терминал)
              → timed_out / validation_failed / save_failed / cancelled
```

Запрещено: `primary_succeeded → fallback_*`, повторный fallback после
`fallback_succeeded`, две параллельные fallback-попытки (защищено
уникальным индексом по `(job_id, provider) where status='started'`),
цикл primary↔fallback (по таблице переходов в `ai-provider.ts`).

### Idempotency и RR

- Одна `ai_jobs.id` ↔ одна оплачиваемая задача. fallback — продолжение
  той же задачи (`credits_status` НЕ меняется при fallback-успехе, если
  primary уже списан).
- Повторный HTTP-запрос с тем же `(user_id, idempotency_key)` возвращает
  существующий job, нового списания нет.
- `/restart` резервной модели не списывает RR.
- `save_failed` не создаёт новое списание — резерв уже учтён.
- Запуск fallback для чужого job невозможен (server-side проверка
  ownership).

На 4a существующая система списания не переписывается. Точки подключения,
которые потребует 4b: `ai-check-*`, `ai-interview-*`, `ai-evaluate`.

## 3. Контракт провайдера

`supabase/functions/_shared/ai-provider.ts` определяет:
- `AiProvider { id, restart?, run }`,
- нормализованные `NormalizedAiRequest` / `NormalizedAiResponse`,
- таблицу `ALLOWED_TRANSITIONS` и `canTransition(from, to)`.

Заглушка `rrProMaxStub.run()` возвращает `{ ok: false, safeErrorCode:
"fallback_not_enabled" }` — реальный сетевой вызов появится на 4b.
Frontend НЕ выбирает провайдера — выбор делает сервер.

## 4. Необходимые Secrets (только имена)

- `RR_PRO_MAX_BOT_ID`
- `RR_PRO_MAX_API_TOKEN`
- `RR_PRO_MAX_BASE_URL` (опционально, если API не совпадает с дефолтным)

Значения не запрашиваются на 4a. Основной `PROTALK_*` secret не
изменялся.

## 5. Что НЕ сделано на 4a (намеренно)

- UI RR Pro Max (отдельная оверлей-кнопка) — этап 4b/4c.
- Реальный сетевой запрос резервной модели — этап 4b.
- Edge-функция `ai-fallback-rrpromax` — этап 4b.
- Подключение списания RR к новой очереди — этап 4b.
- Рефакторинг `CandidateFlow.tsx` (A4) — отдельный план.
- Robokassa не изменялась.
- Основной ProTalk-токен и текущая основная модель не изменялись.