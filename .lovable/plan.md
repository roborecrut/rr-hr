## План реализации (финальный)

Ключи Turnstile получены:
- Site key (публичный): `0x4AAAAAADeYMIxWRbrwfyZa` → пойдёт в `.env` как `VITE_TURNSTILE_SITE_KEY`
- Secret key: `0x4AAAAAADeYMDRyGBbMfm9sAPYzfVxVtbg` → добавлю через secrets tool как `TURNSTILE_SECRET_KEY` (на этапе билда)

### 1. Жёсткая валидация `next` и `redirect_to`
`supabase/functions/_shared/telegramRoute.ts` (+ зеркало в `src/lib/telegramRoute.ts`):
- `safeNextPath` возвращает `{ value, rejected, reason }`. Причины: `empty`, `too_long` (>1024), `bad_encoding` (`%00`, `%5C`), `decoded_traversal` (`%2F%2F`, `%2e%2e`, двойное кодирование `%252e`), `bad_scheme` (`javascript:`, `data:`, `vbscript:`, любой не-`https:`), `protocol_relative` (`//`, `\\`), `path_traversal` (`..`, `.` сегменты), `disallowed_path` (`/auth/telegram/`, `/api/`, `/functions/`).
- `safeRedirect`: только `https:`, отклоняет `userinfo`, порты ≠ 443, причины `bad_port`, `has_userinfo`.
- Все отказы пишутся в `telegram_events` через telemetry helper.

### 2. Метрики + админ-дашборд
Миграция:
- `telegram_events` (`id`, `created_at`, `kind`, `source`, `reason`, `intent`, `host`, `path`, `next_path`, `vacancy_count`, `ip_hash`, `ua_hash`, `meta jsonb`). RLS: только админ читает.
- RPC `admin_telegram_metrics(period)` — count по `kind,reason` + доли routing decision (0/1/много вакансий).
- RPC `log_telegram_event(...)` SECURITY DEFINER с whitelist `kind`.
- GRANT на `authenticated` для RPC, на `service_role` для таблицы.

Компонент `src/pages/admin/TelegramMetrics.tsx` встраивается в `AdminPanel.tsx`: bar-чарт по reasons + pie по routing + таблица сырых логов.

`AuthTelegramDone` шлёт `route_decision` через `log_telegram_event`.

### 3. Guard для `/admin`
`src/components/AdminGuard.tsx`:
- Если `has_role(uid,'admin')` (RPC) → пускаем.
- Иначе: проверка `window.self !== window.top` + `document.referrer` через `new URL()`, hostname ∈ `lovable.dev`, `*.lovableproject.com`, `*.lovable.app`. Кеш в `sessionStorage`.
- Иначе → `navigate('/')`.

Все мутирующие действия в `AdminPanel` дополнительно проверяют роль перед вызовом.

### 4. Turnstile + ad-hoc rate-limit
- `bun add @marsidev/react-turnstile`.
- `.env`: `VITE_TURNSTILE_SITE_KEY=0x4AAAAAADeYMIxWRbrwfyZa`.
- `AuthModal.tsx`: виджет Turnstile перед кнопками; токен прикладывается к `telegram-oidc-start`.
- `telegram-oidc-start`: верифицирует токен через `https://challenges.cloudflare.com/turnstile/v0/siteverify`, fail → 403 + `turnstile_fail` event.
- Миграция: `rate_limits(key text pk, window_start timestamptz, count int)`, RPC `rl_hit(_key, _window_sec, _limit)` → `boolean`.
- `telegram-oidc-start`: лимиты `ip:<sha256>` (10/мин, 60/час), `tg:<intent>:<ip>` (20/час).
- `telegram-oidc-callback`: `cb:<state>` (1/мин), `cb-ip:<ip>` (30/мин).
- В UI комментарий: это ad-hoc лимит, не полноценный L7 DDoS (предупреждение от Lovable Cloud).

### 5. Расширенные тесты
`supabase/functions/_shared/telegramRoute_test.ts`:
- `safeRedirect`: `https://hr-rr.online:8443` → `bad_port`; `https://user:pass@hr-rr.online` → `has_userinfo`; `HTTPS://HR-RR.ONLINE/x` → accepted (нормализация); `http://hr-rr.online` → `bad_protocol`.
- `safeNextPath`: `javascript:alert(1)`, `/%2e%2e/admin`, `/%252e%252e/admin`, `/%00bar`, `\\evil`, `//evil.com`, `next` длиной >1024, пустая строка, `/auth/telegram/done`.
- `chooseCandidateTarget`: матрица `vacancyCount ∈ {-1,0,1,2,3}` × `firstPublicId ∈ {null,'','pid'}` × `nextPath ∈ {null,'/x','/landing?ref=emp123'}`.

### Файлы
**Front:** `src/lib/telegramRoute.ts`, `src/pages/AuthTelegramDone.tsx`, `src/pages/AdminPanel.tsx`, `src/pages/admin/TelegramMetrics.tsx` (new), `src/components/AdminGuard.tsx` (new), `src/components/AuthModal.tsx`, `src/App.tsx`, `.env`, `package.json`.

**Edge:** `supabase/functions/_shared/telegramRoute.ts`, `_shared/telemetry.ts` (new), `_shared/rateLimit.ts` (new), `telegram-oidc-start/index.ts`, `telegram-oidc-callback/index.ts`, `_shared/telegramRoute_test.ts`.

**DB:** новая миграция с `telegram_events`, `rate_limits`, RPC `log_telegram_event`, `admin_telegram_metrics`, `rl_hit` + GRANT + RLS.

**Secrets:** `TURNSTILE_SECRET_KEY` (через secrets tool после approve плана).

### Что НЕ делаем
Sentry, реальный CDN/WAF, изменения OIDC-протокола.
