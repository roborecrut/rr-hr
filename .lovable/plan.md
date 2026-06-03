## Миграция Telegram-логина на OpenID Connect (OIDC)

Telegram задеприкейтил старый `data-auth-url` флоу виджета и перевёл логин на стандартный OIDC через `oauth.telegram.org`. Переписываем регистрацию работодателей, кандидатов и реферальную цепочку на новый флоу.

### 1. Секреты (Lovable Cloud)
Добавить через secrets tool:
- `TELEGRAM_OIDC_CLIENT_ID` = `7919378481`
- `TELEGRAM_OIDC_CLIENT_SECRET` = `URLgf27LlSizVsat5j88wAXu8HWYLAXG7Fq358lQzbG05E2G4qI66w`

Существующие `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` остаются — нужны для miniapp, webhook и `telegram-request-contact`.

### 2. Шаги в BotFather (вручную, после деплоя)
В разделе **Login → OpenID Connect** добавить Callback URLs:
- `https://hr-rr.online/auth/telegram/callback`
- `https://www.hr-rr.online/auth/telegram/callback`
- `https://hr-rr.ru/auth/telegram/callback` (на всякий случай)
- `https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app/auth/telegram/callback` (превью)

### 3. База: новая таблица `oauth_states`
Миграция:
```sql
CREATE TABLE public.oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  intent TEXT NOT NULL,           -- 'employer' | 'candidate'
  ref TEXT,                       -- реферальный public_id
  redirect_to TEXT,               -- куда вернуть после успеха
  provider TEXT NOT NULL DEFAULT 'telegram',
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- доступ только через service_role из edge функций; политик для anon/authenticated не нужно
```
TTL 10 минут — чистим в callback после использования + cron не обязателен (можно потом).

### 4. Новые edge функции

**`telegram-oidc-start`** (POST, `verify_jwt = false`)
Вход: `{ intent: 'employer'|'candidate', ref?: string, redirect_to?: string }`.
- Генерирует `state` (32 байта) и `code_verifier` (43–128 символов).
- `code_challenge = base64url(SHA256(code_verifier))`, method `S256`.
- Пишет запись в `oauth_states`.
- Возвращает URL:
  ```
  https://oauth.telegram.org/auth?
    bot_id=<TELEGRAM_OIDC_CLIENT_ID>
    &origin=https://hr-rr.online
    &redirect_uri=https://hr-rr.online/auth/telegram/callback
    &response_type=code
    &scope=openid
    &state=<state>
    &code_challenge=<challenge>
    &code_challenge_method=S256
  ```

**`telegram-oidc-callback`** (GET, `verify_jwt = false`)
Параметры: `?code=...&state=...`.
- Достаёт запись из `oauth_states` по `state` (если нет/просрочена → редирект `/auth/telegram/done?error=expired`).
- POST на `https://oauth.telegram.org/token`:
  ```
  grant_type=authorization_code
  code=<code>
  code_verifier=<verifier>
  client_id=<CLIENT_ID>
  client_secret=<CLIENT_SECRET>
  redirect_uri=<тот же>
  ```
- Парсит `id_token` (JWT). Верифицирует подпись через Telegram JWKS (`https://oauth.telegram.org/.well-known/jwks.json`, кэш в памяти функции).
- Из claims берёт: `sub` (telegram id), `name`, `preferred_username`, `picture`.
- Логика upsert идентична текущему `telegram-auth`:
  - ищет `telegram_links` по `telegram_id + intent`,
  - создаёт user через Admin API (email `tg_<id>_<intent>@rrhr.local`),
  - создаёт `employers` строку при `intent='employer'`,
  - вызывает `apply_referral_bonus` если `ref` есть и `intent='employer'`,
  - синкает `profiles.telegram_*` поля.
- Генерит magic-link `token_hash` через `admin.auth.admin.generateLink({ type: 'magiclink', email })`.
- Удаляет запись из `oauth_states`.
- 302 редирект на `${redirect_to || '/'}/auth/telegram/done#token_hash=<hash>&email=<email>&intent=<intent>`.

### 5. Фронт

**Новая страница `/auth/telegram/done`** (`src/pages/AuthTelegramDone.tsx`):
- Читает `token_hash` и `email` из hash-фрагмента.
- Вызывает `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`.
- При успехе — `resolveProfilePathForUser` и `navigate` (employer → `/employer/profile`, candidate → `/main`).
- При ошибке — показывает сообщение и кнопку "Назад".

Зарегистрировать роут в роутере (там, где описаны остальные страницы — `src/App.tsx` или `SegmentDispatcher.tsx`).

**`AuthModal.tsx`** — заменить виджет на кастомную кнопку:
- Убираем `useEffect`, который инжектит `telegram-widget.js`.
- Убираем `__rrTgAuth` и `handleTelegram`.
- Добавляем кнопку «Войти через Telegram», которая:
  1. POST → `telegram-oidc-start` с `{ intent, ref, redirect_to: window.location.origin }`,
  2. Получает `url`,
  3. `window.location.href = url` (полный редирект — у OIDC нет popup-режима, как у виджета).
- Loading-state: «Перенаправляем в Telegram…».

### 6. Что НЕ трогаем
- `telegram-miniapp-auth` (HMAC initData) — продолжает работать как есть.
- `telegram-webhook`, `telegram-send`, `telegram-request-contact`, `telegram-config` — без изменений.
- Старая `telegram-auth` — оставляем на пару релизов как дед-код на случай отката; через 1–2 недели можно удалить.
- Google OAuth — не меняется.
- DB-поля `profiles.telegram_*`, `telegram_links`, `apply_referral_bonus` — уже есть, переиспользуем.

### 7. Технические детали и риски
- `origin` и `redirect_uri` обязаны точно совпадать с тем, что прописано в BotFather, иначе OIDC вернёт `invalid_redirect_uri`.
- JWKS Telegram: ключи RS256, ротация редкая, но обязательно кэшировать и обрабатывать `kid`.
- `code_verifier` хранится только server-side в `oauth_states` (PKCE на стороне фронта не нужен — стейт серверный).
- На превью-доменах нужен отдельный callback URL в BotFather — иначе Telegram не пустит.

После твоего «ок» — переключаюсь в build mode, добавляю секреты, миграцию, две edge функции, страницу `/auth/telegram/done` и переписываю кнопку в `AuthModal`.
