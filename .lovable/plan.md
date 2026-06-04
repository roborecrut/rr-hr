## План исправления Telegram-регистрации и Mini App

### 1. Исправить Telegram OIDC Login по документации
- В `telegram-oidc-start` собрать URL авторизации как стандартный Telegram Login/OIDC flow:
  - использовать `client_id`, а не `bot_id`;
  - убрать нестандартные `origin` и `bot_id`, которые сейчас могут приводить Telegram к `ошибка 200`/не тому режиму авторизации;
  - оставить `redirect_uri`, `response_type=code`, `scope=openid profile`, `state`, PKCE `code_challenge`.
- В callback оставить обмен `code` на `id_token`, но добавить подробное логирование всех отказов Telegram: `missing_code_or_state`, `state_expired`, `token_exchange_failed`, `id_token_invalid`, `create_user_failed`, `magiclink_failed`.
- Проверить, что callback URI остаётся один и тот же:
  `https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/telegram-oidc-callback`

### 2. Восстановить auth trigger в базе
- Создать миграцию, которая заново привяжет `public.handle_new_user()` к `auth.users` через `on_auth_user_created`.
- Это важно, потому что в текущей базе функция есть, но триггеров нет — новые Telegram/Google пользователи могут создаваться без профиля/роли.
- В этой же миграции расширить допустимые значения `log_telegram_event`, чтобы сервер мог писать все новые ошибки Telegram/Mini App без падений логирования.

### 3. Починить создание/переиспользование Telegram-аккаунта
- В `telegram-oidc-callback` и `telegram-miniapp-auth` искать существующую привязку сначала по `telegram_id` без жёсткой привязки к intent.
- Если пользователь уже привязан к Telegram — сразу использовать его текущий `user_id` и редиректить в его кабинет.
- Если привязки нет — автоматически создать пользователя через Telegram, создать профиль/роль/запись работодателя или кандидата по intent, записать `telegram_links`, затем сразу выдать magiclink session и редирект.
- Роли и `account_kinds` добавлять аддитивно, не удаляя существующие Google/Telegram или employer/candidate состояния.

### 4. Сделать Mini App auto-auth надёжным
- В `TelegramMiniAppBoot` получать `initData` не только из `window.Telegram.WebApp.initData`, но и fallback из launch params (`tgWebAppData`) в `location.hash/search`, как описывает Mini App документация.
- Если `initData` есть:
  - вызвать `tg.ready()`/`tg.expand()`;
  - если Supabase-сессия уже есть — проверить профиль и сразу редиректить в личный кабинет;
  - если сессии нет — вызвать `telegram-miniapp-auth`, проверить подпись `initData` на backend, создать/переиспользовать Telegram-пользователя и редиректить.
- Если приложение действительно открыто в Telegram, но `initData` не удалось получить — записать диагностический лог; в обычном браузере не шуметь.

### 5. Логировать ошибки при клике и авто-регистрации
- Добавить единый frontend helper для `log-client-error`, чтобы не терять ошибки из `AuthModal`, `CompanyLanding`, `JobVacancyLanding`, `EmployerPanel`, `TelegramMiniAppBoot`, `AuthTelegramDone`.
- Логировать:
  - клик по Telegram входу;
  - ответ `telegram-oidc-start`, если нет `url`;
  - сетевую ошибку fetch;
  - отказ/ошибку callback;
  - ошибку `verifyOtp`;
  - Mini App: нет initData в Telegram-контексте, плохая подпись, create/link/magiclink failure, redirect decision.

### 6. Улучшить пользовательское сообщение об ошибке
- Вместо `Telegram: ошибка 200` показывать причину из ответа backend/Telegram, например:
  - `Telegram Login не настроен в BotFather: проверьте Allowed URLs`;
  - `Telegram отклонил redirect_uri`;
  - `Не удалось создать сессию`.
- В админском журнале останутся технические детали: status, body, host, path, intent, ref, user agent hash.

### 7. Проверка после внедрения
- Задеплоить изменённые Edge Functions.
- Проверить через Supabase logs, что `telegram-oidc-start` вызывается и возвращает корректный `oauth.telegram.org/auth?...client_id=...` URL.
- Проверить, что при Mini App с валидным `initData` backend создаёт/переиспользует пользователя и отдаёт `token_hash + target`.
- Проверить таблицы `client_errors` и `telegram_events`: ошибки клика, callback и Mini App должны появляться там, а не теряться в браузере.