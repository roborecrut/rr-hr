## Что подтвердилось по диагностике

- В БД у свежих пользователей есть только роль `candidate`, `employers_count = 0`, `account_kinds = []`, `last_signup_intent = null` — то есть финализация регистрации работодателя не отработала.
- В проекте есть функция `handle_new_user`, но в текущей БД нет активного auth-trigger, поэтому новые auth-пользователи не получают корректный профиль автоматически.
- `AuthCallback` сейчас может молча проглотить ошибку `auth-google-finalize` и вернуть пользователя на исходный лендинг — поэтому после Google входа вы видите ту же страницу вместо профиля.
- `TelegramMiniAppBoot` запускается на каждой странице. В обычном браузере `window.Telegram.WebApp` может существовать из-за подключенного скрипта, но `initData` пустой — это не Mini App, и запись `miniapp_no_init_data` сейчас является шумом.
- В кабинете работодателя Telegram-профиль имеет дефолтные заглушки в state (`Сергей`, `cowal_sales`, fake ID/avatar), поэтому UI может выглядеть как привязанный Telegram даже без реальной записи.

## План правок

### 1. Починить базовую auth-схему и текущую ошибочную регистрацию

- Добавить миграцию, которая восстановит trigger на `auth.users` для `public.handle_new_user`.
- Изменить `handle_new_user`, чтобы он не назначал `candidate` по умолчанию для OAuth-пользователей без явного intent. Роль должен окончательно назначать finalize-flow.
- Для текущего админ/рабочего аккаунта сделать repair: добавить `employer` роль и запись в `employers`, если кандидатской записи нет и регистрация была фактически как работодатель.
- Убедиться, что `profiles.account_kinds` и `profiles.last_signup_intent` заполняются при каждой финализации регистрации.

### 2. Сделать Google OAuth устойчивым к потере intent

- В `AuthModal` передавать intent/context не только через `sessionStorage`, но и через query-параметры callback URL:
  - `intent=employer|candidate`
  - `company_slug`
  - `project_slug`
  - `project_id`
  - `return_to`
- В `AuthCallback` читать context сначала из URL, затем из storage.
- Убрать текущую логику, где при ошибке `auth-google-finalize` пользователь просто возвращается на исходную страницу.
- Если finalize не создал нужный профиль/роль — показывать ошибку и писать ее в `client_errors`, а не делать вид, что вход успешен.
- После успешного Google входа всегда переходить на target из `auth-google-finalize`, а не на `return_to`, если это регистрационный сценарий.

### 3. Усилить `auth-google-finalize`

- Делать `upsert` профиля, а не только `update`, потому что trigger мог не создать профиль.
- Всегда добавлять роль по intent аддитивно: `employer` не удаляет `candidate`, `candidate` не удаляет `employer`.
- Для intent `employer` гарантированно создавать строку в `employers` и возвращать `/employer{public_id}/profile`; если insert не удался — возвращать понятную ошибку.
- Для intent `candidate` с vacancy/company context создавать или находить `candidates` по `(user_id, project_id)`, записывать `referrer_employer_id`, возвращать профиль кандидата именно по этой вакансии.

### 4. Починить Telegram OIDC кнопку и журнал ошибок

- В `AuthModal` и кнопке привязки Telegram в кабинете логировать ошибки не только когда ответ пришел с HTTP-статусом, но и когда `fetch` упал до ответа.
- Для Turnstile убрать блокировку Telegram OIDC, если на фронте нет публичного `VITE_TURNSTILE_SITE_KEY`, но на Edge есть `TURNSTILE_SECRET_KEY`; оставить rate limit как защиту. Иначе текущая конфигурация дает 403 без возможности пройти проверку.
- Возвращать пользователю точные сообщения: `turnstile_required`, `redirect_rejected`, `state_persist_failed`, `env_missing`, а не общий текст “Не удалось начать вход через Telegram”.
- Проверить/добавить `GRANT EXECUTE` для `admin_telegram_metrics` authenticated/admin flow, чтобы “forbidden” в метриках означал именно отсутствие admin-роли, а не проблему доступа к RPC.

### 5. Вынести Mini App авторегистрацию в отдельный hook

- Создать `src/hooks/useTelegramMiniAppAuth.ts` и перенести туда определение Telegram Mini App.
- `TelegramMiniAppBoot` оставить тонким компонентом, который вызывает hook.
- Не писать `miniapp_no_init_data` в обычном браузере, даже если `window.Telegram.WebApp` существует из-за подключенного SDK.
- Ждать готовности Telegram SDK и `initData` несколько попыток, не завершать flow навсегда после первой пустой проверки.
- Если Mini App действительно открыт внутри Telegram:
  - вызвать `telegram-miniapp-auth`;
  - автоматически создать/найти пользователя;
  - назначить правильную роль;
  - создать candidate/employer profile при необходимости;
  - сразу перенаправить в профиль.

### 6. Доработать `telegram-miniapp-auth`

- Для уже привязанного Telegram пользователя определять target по существующим ролям/профилям.
- Для нового пользователя по умолчанию создавать candidate-профиль, если нет employer context.
- Если `start_param` содержит employer/project context — привязать кандидата к работодателю/вакансии.
- Возвращать target в формате профиля, а не `/main`, когда профиль создан.
- Логировать `bad_signature`, `create_user_failed`, `link_failed`, `target_resolution_failed` в `telegram_events`/`client_errors`.

### 7. Исправить кабинет работодателя: Telegram без заглушек

- Убрать дефолтные Telegram-значения из state:
  - fake ID `59384591`
  - `Сергей Ковалев`
  - `cowal_sales`
  - fake avatar
- Если `profiles.telegram_id` пустой — показывать только статус “Не привязан” и кнопку “Привязать Telegram”.
- Не показывать блок avatar/username/ID/“Уведомления ВКЛ” без реальной Telegram-привязки.
- После успешной Telegram-привязки обновлять данные из `profiles`, а не из localStorage/mock API.

### 8. Исправить UX для уже вошедшего пользователя

- При открытии основного лендинга проверять текущую Supabase-сессию.
- Если пользователь уже имеет employer profile — сразу переводить в `/employer{public_id}/profile` или показывать кнопку “Открыть кабинет” вместо регистрации.
- Если пользователь уже имеет candidate profile и находится на vacancy landing — переводить в профиль кандидата по этой вакансии или показывать “Продолжить собеседование”.
- Если пользователь вошел Google, но хочет добавить второй профиль работодателя/кандидата — не просить повторную OAuth-регистрацию, а вызвать finalize/ensure-profile для текущей сессии.

## Проверка после внедрения

- Google с главного лендинга создает `profiles.account_kinds = ['employer']`, роль `employer`, строку `employers`, редиректит в профиль работодателя.
- Google с лендинга вакансии создает/находит `candidate`, ставит роль `candidate`, записывает `project_id` и `referrer_employer_id`, редиректит в профиль кандидата.
- Один auth-аккаунт может иметь обе роли и оба профиля.
- Telegram OIDC больше не падает без понятного лога.
- Mini App в Telegram выполняет авторегистрацию и редиректит в кабинет; обычный браузер не создает ложный `miniapp_no_init_data`.
- Кабинет работодателя не показывает Telegram-заглушки без реальной Telegram-привязки.