## Цель

Спроектировать полную базу данных в Supabase для HR-платформы RR (работодатели, кандидаты, вакансии, лендинги, ИИ-интервью, обучение, оплаты, Telegram/Google auth) и набор Edge Functions взамен текущих заглушек `/api/*`. Регистрация — через Google OAuth (встроено в Supabase) и через Telegram Login Widget / Telegram Mini App.

## Аудит кода (что используется в `/api/*`)

Из обхода `src/`:

- Сущности: employers, candidates, projects (вакансии), companies, payments, telegram-logs, ai-status, questions (5 категорий), training blocks.
- Эндпоинты: `/api/employers`, `/api/employers/:id`, `/api/employers/:id/purchase`, `/api/employers/:id/topup`, `/api/candidates`, `/api/candidates/:id`, `/api/projects`, `/api/projects/:id`, `/api/companies`, `/api/telegram-logs`, `/api/telegram-mock-send`, `/api/ai-status`, `/api/admin/payments`, `/api/admin/candidates/:id`, `/api/admin/...`, `/api/get-questions`, `/api/evaluate-resume`, `/api/evaluate-checklist`, `/api/evaluate-situations`, `/api/evaluate-training-block`, `/api/enhance-single-field`, `/api/enhance-all-fields`, `/api/enhance-all-vacancy-fields`, `/api/parse-company-file`, `/api/parse-vacancy-file`, `/api/parse-training-file`, `/api/generate-project-onboarding`, `/api/employer-assist`, `/api/candidate-assist`, `/api/vacancy-consultant-chat`.
- Типы из `src/types.ts`: `Candidate`, `JobProject`, `TrainingBlock/Lesson/Quiz`, `CandidateScores`.

## Схема БД (30 таблиц)

### Auth / профили (универсально для двух ролей)

1. `app_role` enum: `admin | employer | candidate`.
2. `user_roles(user_id, role)` — отдельная таблица ролей + `has_role()` SECURITY DEFINER (по нашему стандарту, во избежание privilege escalation).
3. `profiles` — общая базовая инфа на `auth.users.id`: `display_name, avatar_url, locale, registered_via (google|telegram|email), telegram_id, telegram_username, google_email, created_at`. Заполняется триггером `on_auth_user_created`.
4. `telegram_links` — связь `auth.users.id` ↔ `telegram_id`, хеш проверки подписи, `auth_date`. Используется и виджетом, и Mini App `initData`.
5. `employers` — рабочий профиль работодателя: `user_id (FK auth.users unique), company_name, contact_name, contact_email, contact_tg, ref_by, balance_rr (numeric default 0), bonus_granted bool, plan, status`.
6. `candidates` — рабочий профиль кандидата: `user_id, project_id (FK), landing_slug, ref_source, current_stage enum(terms|interview|scoring|training|certified), resume_name, resume_text, created_at, registered_via`.

### Компании, вакансии, лендинги

7. `companies` — `owner_employer_id, name, slug unique, logo_url, mission_text, about_text, stats_jsonb, system_text, team_text, payouts_text, schedule_text`.
8. `company_pages` — кастомные суб-страницы лендинга по компании (about/team/payouts/system) с rich-контентом.
9. `projects` (вакансии) — все поля из `JobProject`: `company_id, employer_id, role_name, salary_terms, schedule_terms, motivation_text, custom_wiki, vacancy_text, onboarding_text, mission_text, stats_*, training_*_text, tasks_activity_text, cabinet_tabs_text, logo_url, is_published bool, slug`.
10. `project_landings` — отдельные публичные лендинги вакансии: `project_id, slug, theme, hero_jsonb, sections_jsonb, published_at` (для `/job` и `/company/:slug`).
11. `project_questions` — `project_id, category enum(checklist_prof|checklist_sys|train_prof|train_product|train_sys|roleplay), order_index, question_jsonb (TrainingQuiz)`. Заменяет 5 массивов в JobProject.
12. `project_checklist_items`, `project_roleplay_items` — упорядоченные текстовые списки.

### Воронка кандидата / интервью

13. `candidate_stages_history` — лог переходов по этапам (для CRM канбана и аналитики).
14. `interviews` — `candidate_id, project_id, started_at, finished_at, transcript_text, status`.
15. `interview_messages` — диалог кандидата с ИИ-интервьюером (`sender enum(candidate|ai|recruiter), text, ts`).
16. `candidate_answers` — ответы по `project_questions` (`question_id, answer_text, is_correct, score, feedback`). Покрывает чек-лист и сюжетные ситуации.
17. `candidate_scores` — итоги: `interview_score, resume_score, checklist_points, roleplay_points, overall_score, checklist_score, checklist_sys_score, situations_score, assessment_summary` (1:1 к кандидату или версионно).

### Обучение

18. `training_blocks` — `project_id, title, description, order_index` (Профобучение / Продукт / Процессы-мотивация).
19. `training_lessons` — `block_id, title, content, order_index`.
20. `training_quizzes` — `lesson_id, type (select|text), question, options_jsonb, correct_answer, explanation`.
21. `candidate_training_progress` — `candidate_id, lesson_id, is_completed, score, quiz_feedback, finished_at`.
22. `certifications` — выдача сертификатов по завершении.

### CRM / коммуникации

23. `crm_notes` — заметки рекрутёра по кандидату.
24. `messages_recruiter` — переписка работодатель↔кандидат (тип `Message` из кода).
25. `telegram_logs` — `direction (in|out), chat_id, payload_jsonb, sent_by, created_at` (для `/api/telegram-logs` и mock-send).
26. `ai_runs` — журнал вызовов ИИ (`endpoint, input_jsonb, output_jsonb, tokens, cost_rr, candidate_id, project_id`). Покроет `/api/ai-status` и аналитику.
27. `assistant_chats` — сохранённые чаты `EmployerAIAssistant` и `candidate-assist` (вместо `localStorage`).

### Финансы

28. `wallets` — баланс RR работодателя (`employer_id, balance_rr, hold_rr`).
29. `transactions` — все списания/начисления (`wallet_id, type enum(topup|purchase|bonus|refund|ai_cost), amount_rr, ref_table, ref_id, created_at`).
30. `payments` — внешние оплаты (`employer_id, provider, external_id, amount, currency, status, raw_jsonb`). Для админ-страницы платежей.

### Системные

31. `referrals` — `ref_code, owner_user_id, used_by_user_id, reward_rr`.
32. `audit_log` — действия админов.

(Получается 32 таблицы — с запасом под "не меньше 25".)

### Связи (ключевые FK)

```text
auth.users 1─1 profiles
auth.users 1─1 employers / candidates
employers 1─N companies 1─N projects 1─N project_landings
projects  1─N project_questions / training_blocks / project_checklist_items
training_blocks 1─N training_lessons 1─N training_quizzes
candidates 1─N interviews 1─N interview_messages
candidates 1─N candidate_answers ─► project_questions
candidates 1─1 candidate_scores
candidates 1─N candidate_training_progress ─► training_lessons
employers  1─1 wallets 1─N transactions
employers  1─N payments
```

## Edge Functions (Deno) — заменяют `/api/*`

Каждая функция использует `corsHeaders`, `SUPABASE_SERVICE_ROLE_KEY` где нужен сервисный доступ, и `LOVABLE_API_KEY` для AI Gateway (`https://ai.gateway.lovable.dev/v1`) — без отдельного OpenAI ключа.

1. `telegram-auth` — проверка подписи Telegram Login Widget (HMAC-SHA256 от `BOT_TOKEN`), создаёт/линкует `auth.users` через admin API, возвращает Supabase session. Требует секрет `TELEGRAM_BOT_TOKEN`.
2. `telegram-miniapp-auth` — проверка `initData` (HMAC от `WebAppData`), та же выдача сессии.
3. `telegram-webhook` (`verify_jwt=false`) — приём апдейтов от бота, запись в `telegram_logs`, маршрутизация уведомлений кандидатам.
4. `telegram-send` — отправка сообщений через connector gateway или Bot API (заменяет `telegram-mock-send`).
5. `employer-assist`, `candidate-assist`, `vacancy-consultant-chat` — чат-ассистенты через Lovable AI Gateway (`google/gemini-2.5-flash`).
6. `enhance-single-field`, `enhance-all-fields`, `enhance-all-vacancy-fields` — улучшение текста полей (AI).
7. `parse-company-file`, `parse-vacancy-file`, `parse-training-file` — парсинг загруженных DOCX/PDF (gemini multimodal).
8. `generate-project-onboarding` — генерация полного контента проекта (онбординг, обучение, чек-листы) по brief + сохранение в `projects` + `project_questions` + `training_*`.
9. `evaluate-resume`, `evaluate-checklist`, `evaluate-situations`, `evaluate-training-block` — оценка ответов кандидата, запись в `candidate_answers`, `candidate_scores`, `candidate_training_progress`, `ai_runs`.
10. `get-questions` — выдача вопросов по `project_id + category` (или дефолт по `roleName`).
11. `wallet-topup`, `wallet-purchase` — операции с балансом RR (атомарно через RPC `apply_transaction`).
12. `admin-actions` — удаление/правка из админ-панели (`/api/admin/*`), требует `has_role(uid,'admin')`.
13. `ai-status` — агрегат из `ai_runs` за сутки/неделю.

## RLS / безопасность

- `user_roles` + SECURITY DEFINER `has_role(uid, role)`; роли admin/employer/candidate проверяются в политиках без рекурсии.
- Employers видят только свои companies/projects/candidates/wallet/transactions.
- Candidates видят только свой профиль, свои interviews/answers/training_progress; список проектов — публичный SELECT (для лендингов).
- `project_landings`, `companies (public fields)`, `projects (is_published=true)` — `GRANT SELECT TO anon` для лендингов.
- Все приватные таблицы — только `authenticated`, политики через `auth.uid()` и `has_role`.
- В каждой миграции — обязательные `GRANT` (anon/authenticated/service_role) согласно правилам Lovable Cloud.
- Триггер `handle_new_user`: при создании `auth.users` создаём `profiles` и (если в metadata `intent=employer|candidate`) — соответствующую строку + дефолтную роль; работодателю — `wallets` с бонусом 1000 RR (одноразово, флаг `bonus_granted`).
- Триггеры `updated_at` на всех таблицах с этим полем.

## Что меняется в коде фронта

Это план только по БД и Edge Functions — фронт буду адаптировать отдельным шагом (заменю `fetch('/api/...')` на `supabase.functions.invoke(...)` и прямые SELECT через `@/integrations/supabase/client`, `localStorage` для auth заменю на сессии Supabase). Сейчас фронт не трогаю.

## Порядок выполнения (после approve)

1. Миграция 1 — enums, `profiles`, `user_roles`, `has_role`, триггер `handle_new_user`, базовые grants.
2. Миграция 2 — `employers`, `candidates`, `companies`, `projects`, `project_landings`, связи + RLS.
3. Миграция 3 — questions/checklist/roleplay + training (blocks/lessons/quizzes) + RLS.
4. Миграция 4 — interviews, candidate_answers, candidate_scores, training_progress, certifications.
5. Миграция 5 — wallets, transactions, payments, RPC `apply_transaction`.
6. Миграция 6 — telegram_links, telegram_logs, ai_runs, assistant_chats, crm_notes, messages_recruiter, referrals, audit_log.
7. Запрос секрета `TELEGRAM_BOT_TOKEN` (для login widget / mini app / webhook).
8. Раскладка Edge Functions (по группам, не все сразу).
9. После каждой миграции — прогон `supabase--linter`, фикс предупреждений.

## Открытые вопросы

1. Google OAuth — включить через Supabase Auth Providers (нужно, чтобы вы вставили Client ID/Secret в дашборде Supabase). Подтверждаете?
2. Telegram бот — у вас уже есть `BOT_TOKEN` от @BotFather, или создать новый? (нужен для login widget + webhook). Username бота тоже нужен для виджета.
3. Платежи — пока только таблица `payments` + ручной топап. Реальный провайдер (ЮKassa/Stripe/Paddle) подключаем сейчас или позже?
4. Контент дефолтных вопросов/обучения (когда у проекта пусто) — генерировать ИИ по запросу или засеять seed-набор в БД?
