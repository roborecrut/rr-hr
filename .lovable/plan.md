# BUILD HR-RR — план реализации

Объём огромный (23 раздела ТЗ). Делаю поэтапно, в указанном порядке. После **каждой фазы** — отчёт и пауза для проверки перед следующей. Без автопубликации.

## Фаза 0. Подготовка и регрессионная база

- Прочитать ключевые текущие файлы (`SessionBootstrap`, `AuthModal`, `EmployerPanel`, `InterviewWizard`, `AIWaitProvider`, `aiClient`, `CandidateDetailsModal`, `CandidateInterview`, `VacancyCard`, `CompanySections`, `HiringCalculator`, `_shared/protalk.ts`, `_shared/ai-jobs.ts`, все затронутые edge-функции).
- Зафиксировать текущее поведение и места, которые НЕЛЬЗЯ ломать (ширины кабинета/CRM, канбан, меню, drag-and-drop, RR-биллинг, RLS, оферту, Robokassa, админку).
- Подтвердить найденные root causes из раздела 1 ТЗ.

## Фаза 1. Миграция БД (additive)

Одна миграция, без удаления старых колонок:

- `candidate_scores`: `ai_fit_score numeric`, `employer_overall_feedback jsonb`, `candidate_overall_feedback jsonb`, `candidate_resume_feedback jsonb`, `candidate_checklist_feedback jsonb`, `candidate_situations_feedback jsonb`, `training_employer_feedback jsonb`, `training_candidate_feedback jsonb`, `overall_generated_at timestamptz`.
- `candidate_stage_progress`: `employer_summary jsonb`, `candidate_summary jsonb`.
- RPC `start_ai_job_attempt(job_id, provider)` — SECURITY DEFINER, атомарно: `SELECT … FOR UPDATE`, `max(attempt_number)+1`, проверка отсутствия уже активной попытки того же provider, INSERT в `ai_job_attempts`. Возвращает `attempt_id`/`attempt_number`. `GRANT EXECUTE` только `service_role`.
- Проверить, что `candidate_full_details` (через `to_jsonb`) автоматически отдаёт новые поля.
- НЕ трогать: RLS, существующие данные, `assessment_summary`, `overall_score`, `public_id`, `interview_blocks` payloads, соцссылки.

## Фаза 2. Ядро AI: ретраи, jobs, валидаторы (backend)

`supabase/functions/_shared/`:

- `ai-jobs.ts`:
  - `startPrimaryAttempt`: `provider: "primary"` (фикс enum), вызов новой RPC, проверка ошибок, проброс наверх.
  - `createOrReuseAiJob`: ключ `kind:project_id:request_id`; не реанимировать terminal jobs (`primary_succeeded`/`fallback_succeeded`/`cancelled`/`save_failed`/`validation_failed`); reuse только активной/created.
  - Проверка `error` у каждого insert/update; новые helpers `markSaveFailed`, `markValidationFailed`.
- `protalk.ts`:
  - `callProTalkWithRetry({ messages, chatId, socialId, attempts=3, baseDelay=1500, jitter=true, timeoutMs })`.
  - Retry: AbortError, network, 429, 5xx, `[Server Error: ...]`, пустой ответ, broken JSON, schema-fail.
  - Не retry: 400/401/403/402, `no_project`, `no_candidate`, `no_credits`.
  - Per-attempt `chatId = ai_${jobId}_${attemptNumber}`.
- Новый `_shared/ai-validators.ts`:
  - `validateChecklistChoice10`, `validateChecklistText10`, `validateSituations3`, `validateResumeBundle`, `validateOverallBundle`, `validateTrainingBundle`. Все — strict (длина, уникальность id, непустые поля, correct ∈ options, expected_answer для text).
- Новый `_shared/ai-runner.ts`:
  - `runAiJobInBackground({ jobId, attemptNumber, exec })` — обёртка над `EdgeRuntime.waitUntil`, фиксирует attempt в БД, primary→fallback (RR Pro Max stub из 4a; для ситуаций — такой же fallback, как для анкеты; fallback только при технических ошибках, один раз, без повторного списания RR).

## Фаза 3. Edge-функции переведены на background jobs

Каждая функция: возвращает `{ job_id }` сразу, дальше работает в `waitUntil`. Сохранение результата — только после strict validation, в транзакции, с проверкой `error`. До успеха старый `interview_blocks`/`candidate_scores`/`candidate_stage_progress` НЕ перезаписывается.

- `ai-generate-interview-checklist`: внутри одной job две независимые подзадачи (10 choice + 10 text), валидируются и ретраятся раздельно, объединяются q1..q20 одной транзакцией. Сохраняет `employer_wishes` в payload.
- `ai-generate-interview-situations`: те же правила + fallback. Сохраняет `employer_wishes`.
- `ai-generate-interview-resume-criteria`: сохраняет `employer_wishes`.
- `ai-interview-screen-resume`: один AI-вызов → `{ score, employer:{...}, candidate:{...} }`. Пишет `resume_feedback`, `candidate_resume_feedback`, `resume_score`. `assessment_summary` больше НЕ перезаписывается этой функцией.
- `ai-interview-grade-checklist`: employer+candidate bundle. Пишет `checklist_feedback`, `candidate_checklist_feedback`.
- `ai-interview-grade-situations`: то же → `situations_feedback`, `candidate_situations_feedback`.
- `ai-grade-training-quiz`: employer+candidate bundle на этап. Пишет `employer_summary`, `candidate_summary`, `last_feedback` в `candidate_stage_progress`.
- Новый `ai-evaluate-overall-candidate`: вход `{ candidate_id, request_id }`. Проверяет владельца, сам грузит из БД всё (кандидат, резюме, компания, вакансия, задачи, условия, мотивация, описание системы, все `interview_blocks` + `employer_wishes`, ответы, оценки, этапы обучения). Один AI-вызов → `{ fit_score, employer, candidate }`. Пишет `ai_fit_score`, `employer_overall_feedback`, `candidate_overall_feedback`, `overall_generated_at`. НЕ пишет в `overall_score`/`assessment_summary`.
- `candidate-upload-file` (kind=avatar): MIME image/jpeg|png|webp, ≤5 МБ, `UPDATE candidates SET avatar_url` с проверкой error, возврат publicUrl. Не использует signed URL как постоянный.

## Фаза 4. Frontend: жизненный цикл фоновых задач

- `src/lib/aiJobs.ts` (новый): `launchAiJob(kind, params)` → один `request_id` на клик (UUID), запоминает active job в `localStorage` ключом `rr_active_ai_job:${project_id}:${kind}` (или для overall — `rr_active_ai_job:overall:${candidate_id}`); polling через `get_ai_job_safe_status` с backoff; `visibilitychange`/`focus` → немедленный refresh; восстановление из storage при mount; очистка terminal jobs.
- `src/lib/aiClient.ts`: тонкий wrapper над `supabase.functions.invoke` для запуска job-функций; больше не «гонится» с серверным таймаутом.
- `AIWaitProvider`: убрать `Promise.race` как источник окончательного вердикта. Overlay показывает прогресс, можно закрыть/свернуть. Текст: «Можно продолжать работу — результат сохранится в системе». По завершении — toast + refresh данных. Двойной клик во время active job не запускает новую — переиспользует.
- `InterviewWizard`: запуск всех генераций через `launchAiJob`. Locked-режим — без disabled select, инфо-карточка (роль крупно, компания ниже, метки). Сохранение/восстановление `employer_wishes` для resume/checklist/situations.

## Фаза 5. Google OAuth: убрать зависание AuthModal

- `SessionBootstrap`: единый idempotent `handleAuthenticatedSession`, вызов из `getSession()` на mount + `onAuthStateChange` (`SIGNED_IN`, `INITIAL_SESSION`), in-memory lock + per-user `doneKey`. После bootstrap — `window.location.replace(target)` вместо `history.replaceState + PopStateEvent`.
- `AuthModal`: сбрасывать `isLoading` при `pageshow`/`focus`/`visibilitychange` и при отсутствии session после возврата с Google. Понятное сообщение при отмене.

## Фаза 6. Кабинет работодателя — локальные UX

- `EmployerPanel`:
  - ID работодателя в верхнем правом блоке: 12–13px, контраст, подпись «ID работодателя: 100006».
  - Удалить дубли ID (онбординг, карточка Google-аккаунта, страницы компаний, страница вакансии и т.д.). URL и данные не трогать.
  - Карточка компании: убрать `onClick`/`cursor-pointer`/`title` с контейнера; редактор — только по кнопке «Редактировать»; «Открыть лендинг» и внутренние ссылки работают.

## Фаза 7. CandidateDetailsModal — структурированные отчёты

Новый компонент `EmployerOverallReport`:
- AI-оценка соответствия (`ai_fit_score`) и Средний балл этапов (`overall_score`) — раздельно и подписано.
- Карточки: вердикт+уверенность → executive summary → matches → gaps → risks → red_flags → employer_wishes_alignment → strengths → interview_focus → recommendation.
- Никакого whitespace-pre-wrap; line-height 1.5–1.7; пустые секции скрываются.

Вкладки:
- **Резюме**: сначала employer-блок (балл, вывод, matches/gaps/risks/red_flags/questions_to_verify), затем raw-текст резюме в раскрывающемся блоке.
- **Анкета** и **Ситуации**: сверху общий вывод (балл, summary, strengths, gaps, risks, red_flags), затем разбор по вопросам.
- **Обучение**: по каждому этапу — статус, балл, общий вывод, сильные стороны, пробелы, затем разбор. Новая 4-я вкладка **«Итого»** — финальная training summary (idempotent background job; `training_employer_feedback`/`training_candidate_feedback`).
- Метку «Одобрен ИИ» заменить на градации соответствия.

Кнопка «Пересчитать ИИ-оценку»: `launchAiJob('overall', { candidate_id })`, активное состояние, по окончании — refetch `candidate_full_details`, защита от двойного клика и от перезаписи `overall_score`.

## Фаза 8. CandidateInterview / CandidateFlow — кандидатская обратная связь

- Читает только `candidate_*_feedback`. Никаких внутренних критериев/red flags работодателя/эталонных ответов.
- Тон: нейтральный, уважительный, без личностных оценок; без защищённых характеристик.

## Фаза 9. Кандидатский профиль

- Аватар: после upload сразу сетим в state + refetch; preview; сохранение в БД делает backend.
- Шрифты контактной карточки: подписи 11–12px, значения 13–14px.
- Соцсети: убрать Instagram/MAX/Сетка/GitHub из формы и view; пустые не показывать; если все пусты — секция скрыта. Существующие значения в БД не удаляются.
- Скрыть из вкладки «Профиль» блок «Выберите Компанию & Вакансию» (карточки вакансий, кнопка «Все вакансии компании», предупреждение, технический адрес). `applications` и `project_id` не трогать.

## Фаза 10. Лендинг + калькулятор

- `VacancyCard`: новый prop `layout?: "vertical" | "horizontal"` (default vertical). Horizontal: лого слева, текст по центру, salary/график компактно, действие справа; mobile → vertical.
- `CompanySections` и блок «Другие открытые вакансии компании»: `flex-col`/`grid-cols-1`, использовать `layout="horizontal"`. Глобальные карточки каталога не трогать.
- `HiringCalculator`: удалить только блок «Тарифы — цена за каждое интервью или обучение» (диапазоны 1–9/10–49/50–199/200+, «1 RR = 1 ₽» внутри, перечень разовых услуг). Сам калькулятор, сравнение, «в 4 раза дешевле…», рекомендации и backend-биллинг — оставить.

## Фаза 11. Тесты и регрессия

- Edge-функция smoke-тесты (Deno) для сценариев из раздела 19 ТЗ, где это реалистично: enum=primary, attempt numbers 1/2/3, не-reuse terminal jobs, save_failed путь, валидаторы (20/3), fallback срабатывает только на технических ошибках, нет двойного списания.
- Runtime через Playwright (sandbox): Google-вход без refresh; локед-визард; horizontal cards; калькулятор без блока тарифов; отчёт разбит на блоки; кандидатская вкладка читает свой feedback.
- Регрессия: ширины кабинета/CRM, меню в одну строку, канбан/таблица/DnD/фильтры, регистрация и этапы кандидата, билд + typecheck, отсутствие runtime-ошибок.

## Этапы и контрольные точки

После каждой фазы — короткий отчёт и пауза. Порядок: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**.

Финальный отчёт по всем 17 пунктам раздела 23 ТЗ. **Без автопубликации.**

## Технические детали

- Контракт background job: client `invoke(fn, { body: { ..., request_id } })` → `{ job_id }`; client poll `rpc('get_ai_job_safe_status', { _job_id })` каждые 2–4 сек с backoff; terminal → `removeItem(rr_active_ai_job:*)` + refetch данных.
- RPC `start_ai_job_attempt`: блокирует строку `ai_jobs`, проверяет отсутствие активной попытки того же provider, делает INSERT, возвращает id+number.
- Validators возвращают `{ ok: true, value } | { ok: false, code }`; невалид → retry; после исчерпания primary — fallback; если и fallback невалид — `status=validation_failed`, прежний результат не трогается.
- Save errors → `status=save_failed`, повторная попытка сохранения без повторного AI-вызова и без RR-списания.
- Все новые JSONB-поля рендерятся отдельными компонентами; legacy `assessment_summary` показывается только если нового объекта нет.
- Никаких изменений в `src/integrations/supabase/types.ts` вручную — он регенерируется после миграции.
