## Цель
Исправить регистрацию и вход так, чтобы:
- Telegram OIDC действительно открывал Telegram и писал диагностические ошибки в журнал.
- Telegram Mini App автоматически регистрировал/логинил пользователя и переводил в нужный кабинет.
- Google на главном лендинге регистрировал профиль работодателя, а не кандидата.
- Google/Telegram на лендинге вакансии/компании регистрировал сотрудника/кандидата и привязывал его к работодателю этой вакансии.
- Один аккаунт мог иметь оба типа профиля: работодатель и сотрудник/кандидат.

## Что обнаружено
- Сообщение `forbidden` в блоке «Telegram OIDC · метрики» сейчас похоже на отказ RPC `admin_telegram_metrics`, а не на саму OIDC-ошибку: `/admin` может открыться через Lovable/editor fallback, но RPC внутри БД требует реальную роль `admin`.
- `client_errors` и `telegram_events` сейчас пустые, edge-логи `telegram-oidc-start` тоже пустые: значит клик либо не доходит до edge-функции, либо ошибка происходит до серверной записи.
- В коде есть несостыковка логирования: клиентская RPC-функция `log_telegram_event` разрешает только `route_decision` и `next_reject`, а интерфейс/метрики ожидают также `whitelist_reject`, `rate_limited`, `turnstile_fail`.
- Google OAuth intent сейчас хранится только в `sessionStorage`; DB-trigger `handle_new_user` его не видит при создании пользователя, поэтому новый Google-пользователь получает роль `candidate`, а `auth-google-finalize` потом может создать работодателя и редиректнуть в кабинет работодателя.
- Лендинг компании сейчас использует mock one-click регистрацию через локальные/фейковые данные, а не реальный Google/Telegram OAuth.
- Mini App boot проверяет `window.Telegram.WebApp.initData`, но если Telegram WebApp SDK/контекст не готов или URL открыт не как Mini App, пользователь просто видит обычный сайт без понятной диагностики.

## План правок

### 1. Починить диагностику Telegram
- В `telegram-oidc-start` добавить top-level `try/catch`, чтобы любая ошибка возвращалась JSON-ответом и записывалась в `client_errors`/`telegram_events`.
- В `AuthModal.handleTelegram` и кнопке привязки Telegram в профиле работодателя добавить единый `log-client-error` при:
  - сетевой ошибке fetch,
  - CORS/preflight ошибке,
  - HTTP 403/429/500,
  - отсутствии `data.url`.
- Расширить `public.log_telegram_event`, чтобы она принимала все фактически используемые kind: `whitelist_reject`, `route_decision`, `next_reject`, `rate_limited`, `turnstile_fail`, `start_failed`, `miniapp_failed`.
- В админ-метриках разделить два состояния:
  - «нет событий»;
  - «нет прав администратора / forbidden».
  Так `forbidden` больше не будет восприниматься как Telegram OIDC-ошибка.

### 2. Исправить доступ к админ-журналам
- Проверить/добавить реальную роль `admin` для нужного пользователя через `user_roles`, а не полагаться на editor fallback.
- Оставить RLS строгим: журналы читают только админы; анонимные пользователи могут только отправлять ошибки в `client_errors`.
- После правки админ должен видеть события Telegram OIDC и client errors без `forbidden`.

### 3. Починить Telegram OIDC вход
- Проверить `telegram-oidc-start` на обязательный Turnstile: если `TURNSTILE_SECRET_KEY` есть, а `VITE_TURNSTILE_SITE_KEY` на клиенте не задан/не отрисован, пользователь всегда получит 403. План: сделать это явным в UI и логах.
- Сохранить в `oauth_states` не только `intent/ref/redirect_to`, но и контекст вакансии: `company_slug`, `project_slug`, `project_id`.
- В `telegram-oidc-callback` после успешного Telegram OIDC:
  - синхронизировать имя, фамилию, username, avatar в `profiles`;
  - добавлять нужную роль в `user_roles`;
  - создавать нужный тип профиля: `employers` для employer, `candidates` для candidate;
  - для candidate с вакансии привязывать запись к `projects.employer_id`.

### 4. Починить Telegram Mini App авторегистрацию
- В `TelegramMiniAppBoot` добавить ожидание готовности Telegram SDK несколько коротких попыток, потому что скрипт может быть ещё не доступен при первом render.
- Если `initData` нет, в dev/admin-лог записывать `miniapp_no_init_data` с host/path, чтобы отличать «открыли обычный сайт» от «открыли Mini App».
- В `telegram-miniapp-auth`:
  - создавать/обновлять профиль по intent;
  - добавлять роль `candidate` или `employer`;
  - для `start_param`/реферального контекста направлять кандидата к нужной вакансии/работодателю;
  - возвращать `target`, чтобы фронт не гадал, куда вести пользователя.
- На фронте после `verifyOtp` переходить в `data.target`, а если его нет — использовать resolver.

### 5. Исправить Google регистрацию работодателя
- В `AuthModal.handleGoogle` убрать надежду на `queryParams.intent` как источник для trigger: Google/Supabase не кладут это в `raw_user_meta_data`.
- В `/auth/callback` до вызова `auth-google-finalize` выполнить `supabase.auth.updateUser({ data: { intent, signup_context, company_slug, project_slug } })`, чтобы metadata стала согласованной.
- В `auth-google-finalize` всегда добавлять роль, соответствующую intent, не удаляя вторую роль.
- Для employer intent:
  - создать/найти `employers`;
  - заполнить `contact_name`, `contact_email` из Google;
  - вернуть `/employer{public_id}/profile`.
- В `profiles` добавить поля для бизнес-смысла регистрации, а не только провайдера:
  - `account_kinds` — массив `employer/candidate`;
  - `last_signup_intent` — последний выбранный тип регистрации;
  - `google_name`, `google_avatar_url` или использовать существующие `display_name/avatar_url/google_email` с корректной синхронизацией.

### 6. Поддержать два профиля на одном аккаунте
- Роли остаются в `user_roles`, как и требуется безопасной моделью.
- `profiles` хранит общие данные аккаунта и признаки доступных профилей.
- `employers` и `candidates` остаются отдельными профильными сущностями.
- Resolver `resolveProfilePathForUser` доработать: если у пользователя оба профиля, выбирать путь по явному intent/контексту, а не всегда employer-first.
- В шапках кабинетов добавить переключатель/бейдж:
  - «Профиль работодателя»;
  - «Профиль сотрудника/кандидата»;
  - быстрый переход во второй профиль, если он создан.

### 7. Исправить регистрацию кандидата с лендинга вакансии/компании
- В `CompanyLanding` заменить mock `triggerOneClickRegister("google"|"telegram")` на реальный OAuth:
  - intent всегда `candidate`;
  - передавать `company_slug`, `project_slug`, `project_id`;
  - передавать работодателя через проект (`projects.employer_id`), а не из локального состояния.
- В `JobVacancyLanding` также запускать реальный candidate OAuth для кнопок регистрации.
- В `auth-google-finalize` candidate branch:
  - искать проект по `project_id` или `project_slug + company_slug`;
  - создавать/находить `candidates` для пары `user_id + project_id`;
  - записывать `referrer_employer_id`/аналогичную связь с текущим работодателем;
  - редиректить в `/{companySlug}/{projectSlug}/candidate{publicId}/profile`.
- Для Telegram OIDC/Mini App повторить тот же candidate branch.

### 8. Миграция БД
- Добавить в `profiles` поля `account_kinds`, `last_signup_intent` и при необходимости Google-specific поля.
- Добавить в `candidates` поле связи с работодателем, например `referrer_employer_id`.
- Добавить уникальный индекс/ограничение для кандидата на проект: один `candidate` на `user_id + project_id`, чтобы повторный вход не создавал дубли.
- Расширить `oauth_states` контекстом вакансии/компании.
- Обновить `handle_new_user`, чтобы он корректно заполнял имя, email, avatar, provider и начальные account kinds.
- Все изменения сохранить с RLS и явными GRANT там, где они нужны.

### 9. Проверка после реализации
- Клик Telegram на главном лендинге: должен открыть Telegram или показать точную причину в UI и в журнале.
- Telegram Mini App: при открытии внутри Telegram должен автоматически создать/найти пользователя и перевести в employer/candidate кабинет.
- Google на главном лендинге: новый пользователь получает employer role, employer row и `/employer.../profile`.
- Google на лендинге вакансии: новый пользователь получает candidate role, candidate row с `project_id` и связью с работодателем, затем попадает в кандидатский профиль по URL вакансии.
- Повторный вход тем же аккаунтом не создает дубли, а добавляет недостающий профиль/роль.
- Админ-журнал показывает реальные события вместо пустоты/непонятного `forbidden`.