## Что строим

Единый in-app центр уведомлений (колокольчик в шапке) для работодателей и кандидатов + ручная кнопка «Пригласить на работу» + фоновые напоминания о бездействии через pg_cron.

Каналы внешние (email/Telegram/web push) не подключаем — только in-app, как договорились.

## 1. БД (одна миграция)

Новая таблица `public.notifications`:

| Поле | Тип | Назначение |
|---|---|---|
| `id` | uuid PK | |
| `recipient_kind` | text `'employer' \| 'candidate'` | |
| `employer_user_id` | uuid null | для работодателя = auth user_id |
| `candidate_id` | uuid null | для кандидата |
| `kind` | text | тип события (см. список ниже) |
| `title` | text | заголовок в ленте |
| `body` | text | короткий текст |
| `link` | text null | куда вести по клику |
| `meta` | jsonb | candidate_id / project_id / score |
| `read_at` | timestamptz null | |
| `created_at` | timestamptz default now() | |

Уникальный частичный индекс `(recipient_kind, employer_user_id, candidate_id, kind, meta->>'candidate_id')` для дедупликации событий и напоминаний (нельзя слать одно и то же дважды).

GRANT: `authenticated` — SELECT/UPDATE по своим строкам (RLS), `service_role` — ALL. RLS:
- employer видит свои (`employer_user_id = auth.uid()`)
- кандидат видит свои через `candidate_id = current_candidate_id()`

Новые поля в `candidates`:
- `hire_decision` text null (`'invited' | 'rejected'`)
- `hire_decided_at` timestamptz null
- `hire_message` text null

Новые поля в `projects`:
- `notify_score_threshold` int default 70 — порог «подходящего кандидата»

RPC:
- `notifications_list(_limit int)` → лента + unread_count для текущего viewer-а (employer ИЛИ candidate по токену)
- `notifications_mark_read(_ids uuid[])` — пометить прочитанным
- `notifications_mark_all_read()` 
- `candidate_invite_decision(_candidate uuid, _decision text, _message text)` — работодатель ставит invited/rejected, кладёт notification кандидату

Триггер на `candidate_scores` AFTER INSERT/UPDATE: если `overall_score >= projects.notify_score_threshold` И раньше уведомления этого типа не было → INSERT в `notifications` для владельца проекта (kind `'candidate_passed'`).

Триггер на `certifications` AFTER INSERT: → уведомление работодателю kind `'candidate_certified'`.

## 2. Cron-напоминания

Включаем `pg_cron` (если ещё не). Один SQL-job каждые 30 минут вызывает RPC `notifications_run_reminders()`:

- **employer_company_empty_24h** — employer создан > 24 ч назад, у него нет ни одной companies со status='active' и непустым name. Один раз.
- **employer_no_vacancy_48h** — есть companies active, но нет projects со status='active'. Через 48 ч после создания компании. Один раз.
- **candidate_interview_abandoned_24h** — есть `interview_messages` или `candidate_answers` за последние 7 дней, но нет `candidate_scores.overall_score`, последняя активность > 24 ч. Один раз на кандидата.
- **candidate_training_abandoned_48h** — есть `candidate_training_progress` записи, но нет `certifications`, последняя активность > 48 ч. Один раз.

Дедуп через уникальный индекс по `(recipient, kind, meta->>'scope_id')`.

## 3. Frontend

Новый компонент `src/components/NotificationsBell.tsx`:
- иконка-колокольчик с бэйджем непрочитанных
- popover со списком (последние 20)
- realtime-подписка на `notifications` (insert по своему recipient)
- клик по элементу → `mark_read` + переход по `link`
- «Прочитать все»

Вставляем в `SiteHeader` (работодатель) и в шапку `CandidateFlow` (кандидат).

В `CandidateDetailsModal` (карточка кандидата у работодателя) добавляем блок «Решение по кандидату»:
- кнопки «Пригласить на работу» / «Отказать»
- модалка с textarea для сообщения
- вызывает `candidate_invite_decision` → создаёт notification кандидату с link на его кабинет
- показывает текущий статус если уже принято

В кабинете кандидата (`CandidateFlow`) — баннер с решением, если `candidates.hire_decision='invited'`: «Вас пригласили на работу в {company}» + текст сообщения работодателя.

## 4. Тексты уведомлений

Все по-русски, единый тон с маскотом.

| kind | Кому | Заголовок | Body |
|---|---|---|---|
| `candidate_passed` | employer | Новый подходящий кандидат | {name} прошёл интервью с баллом {score}/100 |
| `candidate_certified` | employer | Кандидат сертифицирован | {name} завершил обучение и готов к найму |
| `candidate_invited` | candidate | Вас пригласили на работу | Работодатель {company} ждёт вас. Откройте сообщение. |
| `candidate_rejected` | candidate | Решение по вашей кандидатуре | Работодатель {company} принял решение. Подробности внутри. |
| `employer_company_empty_24h` | employer | Допишите компанию | Без описания компании кандидаты не пойдут. Это 5 минут. |
| `employer_no_vacancy_48h` | employer | Опубликуйте первую вакансию | Компания готова — добавьте вакансию, чтобы начать получать отклики. |
| `candidate_interview_abandoned_24h` | candidate | Завершите интервью | Вы остановились на интервью. Вернитесь и закончите — это 10 минут. |
| `candidate_training_abandoned_48h` | candidate | Закончите обучение | Без сертификата работодатель не увидит вас как готового. Допройдите обучение. |

## 5. Что НЕ трогаем (по правилам релиза)

Robokassa, RR-баланс, RR Pro Max, CRM (`crm_stage`), расчёт оценок, кандидатская машина состояний. Решение работодателя — отдельные поля `hire_decision`, не вмешивается в `current_stage`.

## Порядок работ

1. Миграция: notifications + поля + RPC + триггеры + GRANT/RLS.
2. pg_cron job + RPC `notifications_run_reminders`.
3. `NotificationsBell` + интеграция в SiteHeader / CandidateFlow.
4. Блок «Решение» в CandidateDetailsModal + баннер в CandidateFlow.
5. Realtime подписка.
6. Build + проверка.

Подтверди — и стартую.