## PHASE 3B-2A — Vertical Slice: Resume Screening v2

Полный сквозной сценарий только для скрининга резюме. Действующая `ai-interview-screen-resume` НЕ меняется (rollback-контур). Новая `ai-interview-screen-resume-v2` использует job lifecycle, реальный RR Pro Max, атомарный stage-specific save, frontend polling с восстановлением после reload.

### Выбранный вариант защиты live-продукта
**Versioned function**: создаём `ai-interview-screen-resume-v2`. Старая функция остаётся как есть. Frontend переключается на v2 только в зоне отображения резюме.

---

### 1. Preflight (миграции, без изменения бизнес-логики)
- Прочитать фактический SQL `debit_ai_job_once`, `start_ai_job_attempt`, `ai_job_debits` — подтвердить атомарность, service_role only, `search_path=public`.
- Подтвердить бизнес-правило: один `spend_pack(_kind='interview')` на кандидата (ключ `pack:interview:{candidate_id}`). `ai_job_debits` — техническая привязка job↔списание, НЕ превращает 3 этапа в 3 платных интервью. resume/checklist/situations используют один и тот же interview credit.
- Additive migration (если нужно): добавить `duration_ms` в `ai_job_attempts` (если отсутствует); добавить `resume_version` / `resume_hash` в `candidates` (если отсутствует).
- Новая RPC `save_candidate_resume_evaluation_v2(_candidate uuid, _resume_score int, _resume_feedback jsonb, _candidate_resume_feedback jsonb, _assessment_summary text)`:
  - SECURITY DEFINER, `search_path=public`, EXECUTE только `service_role`.
  - Атомарный UPDATE только: `resume_score`, `resume_feedback`, `candidate_resume_feedback`, `assessment_summary`, `updated_at`. Не трогает checklist/situations/overall/training поля.
  - Возвращает сохранённую строку.
- RPC `get_ai_job_safe_status(_job_id uuid)` для polling: возвращает `{status, job_type, attempts_count, updated_at}` без request_snapshot/result. EXECUTE для `authenticated` + проверка владельца (candidate_id принадлежит вызывающему через candidate_sessions).

### 2. Shared backend
- `supabase/functions/_shared/ai-validators.ts`: добавить `validateResumeScreenReport(obj)` со строгой схемой (employer{verdict, summary, matches[], gaps[], strengths[], risks[], red_flags[], questions_to_verify[]}, candidate{summary, strengths, areas_to_clarify, recommendations}, score 0..100). Enums для verdict/severity/degree. Отклонять risk/red_flag без evidence. Отклонять markdown fences.
- `_shared/ai-runner.ts`: рефакторинг под интерфейсы (`ProviderAdapter`, `JobRepository`, `AttemptRepository`, `BillingAdapter`, `ResultRepository`, `ClockAdapter`) с production adapters по умолчанию. Сохранить текущее API `runJobLifecycle`.
- `_shared/protect-pii.ts`: набор regex/keyword guard для prompt — инструкция модели игнорировать защищённые характеристики; пост-валидатор отклоняет evidence-цитаты с возрастом/полом/национальностью/религией без объективной причины.

### 3. Новая edge function `ai-interview-screen-resume-v2`
Контракт:
```
POST { request_id: uuid, async_version: 2 }   (candidate_id берётся из candidate token)
→ { ok, job_id, status, reused, terminal }
```
Порядок:
1. CORS, method, body schema.
2. `requireCandidateToken` → candidateId. Загрузить project_id, criteria, vacancy, resume_text, resume_version/hash из БД (сервер). Если `resume_text` пуст → 400 `no_resume`.
3. `idem = screen_resume:${candidateId}:${request_id}`. `createOrReuseAiJob` с `requestSnapshot = { candidate_id, project_id, resume_version, resume_hash, criteria_version, requested_at }` (без текста резюме).
4. Если job reused и terminal → вернуть `{terminal:true, status}`.
5. Если новая job → `debitAiJobOnce(job_id, candidate_id, 'interview')` который внутри вызывает `spend_pack` с тем же ключом `pack:interview:{candidate_id}` (повторный вызов того же кандидата по другому этапу не списывает повторно). При `no_credits` → не запускать provider, статус job `cancelled`/`primary_failed` с safeCode `no_credits`, вернуть 402.
6. Проверить `EdgeRuntime.waitUntil` — если нет → 503, без debit.
7. `runInBackground(runJobLifecycle({...}))` с:
   - **primary**: ProTalk via `_shared/protalk.ts` (до 3 attempts, backoff+jitter, отдельный chat_id, диагностика).
   - **fallback**: `RrProMaxProvider` (`_shared/rr-pro-max.ts`) с реальным `RR_PRO_MAX_BOT_ID`/`RR_PRO_MAX_API_TOKEN`. Если `isConfigured()===false` → не fallback_succeeded, статус `fallback_unavailable`.
   - **validate**: `validateResumeScreenReport`.
   - **save**: RPC `save_candidate_resume_evaluation_v2`.
8. Вернуть `{ok, job_id, status:'primary_running', reused:false, terminal:false}`.

### 4. Frontend
- `src/lib/aiJobs.ts` (новый, generic): `startResumeScreenV2(candidateId)`, `pollJob(jobId)`, восстановление по `localStorage` ключу `rr_active_ai_job:screen_resume:${candidate_id}` (только `{job_id, request_id, candidate_id, created_at}`). Polling 2s→4s→8s (cap 8s), очистка таймера на unmount, listeners `focus`/`visibilitychange`.
- `AIWaitProvider`: добавить новый метод `waitForJob(jobId, {stageLabel})` параллельно текущему API — не трогать существующие вызовы. Overlay сворачиваемый, текст: «Анализ выполняется. Можно продолжить работу — результат сохранится автоматически».
- `CandidateInterview.tsx`: в обработчике запуска резюме переключиться на `aiJobs.startResumeScreenV2` + `waitForJob`. Двойной клик блокируется по `active job key`. После terminal success — refetch candidate.
- Чтение `candidate_resume_feedback` (новое поле в `candidate_scores`, append-only логика; legacy fallback на старый `resume_feedback` без employer-only секций).
- `CandidateDetailsModal.tsx`: только вкладка «Резюме» рендерит новый структурированный отчёт из `resume_feedback` (matches/gaps/strengths/risks/red_flags/questions_to_verify). Карточки + списки + раскрываемый блок с raw resume text. Остальные вкладки не трогаем.

### 5. Tests (Deno, in-memory adapters)
`supabase/functions/_shared/ai-runner_test.ts` — все 28 сценариев из ТЗ (primary success / timeout retry / 429 / 502 / empty / broken JSON repair / schema invalid / fallback success / both fail / save fail / diagnostics fail / terminal update fail / reuse active / reuse terminal / new request_id new job / double debit one charge / retry one charge / no_credits no provider call / parallel primary one active / fallback during active primary forbidden / chat_id / duration_ms / provider tag primary / provider tag rr_pro_max / failed new run preserves old / resume save isolates fields / protected characteristic ignored / red flag without evidence rejected / candidate report has no employer fields / reload polling no new job).
`ai-validators_test.ts` — расширить под новый report schema.

### 6. Regression
TS clean, production build clean (Lovable runs автоматически), старая `ai-interview-screen-resume` не изменена, анкета/ситуации/обучение/CRM/канбан/таблица/меню/ширины не трогаются.

### 7. Финальный отчёт
По всем пунктам из секции 20 ТЗ. Без публикации.

---

### Технические замечания
- `candidate_resume_feedback` колонка отсутствует в `candidate_scores` — добавляется этой миграцией.
- `resume_version`/`resume_hash` — если в `candidates` нет, добавим nullable text колонки и заполним при сохранении resume_text в backend.
- Runtime-проверка RR Pro Max: использую контролируемый primary fail (невалидный prompt route или временный флаг) — не расходуем неконтролируемо реальные кредиты.
- Объём кода большой (~10 файлов + 1 миграция + ~30 тестов). Реализую последовательно: миграция → shared → v2 function → tests → frontend.

**После плана: жду подтверждения, потом запускаю миграцию первой (она требует approval), затем код параллельно.**
