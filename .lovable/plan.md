## Цель
Ужесточить валидацию `next`, собирать метрики whitelist/маршрутизации в БД и админку, закрыть `/admin` от посторонних, добавить защиту от ботов на старте Telegram-OIDC и расширить тесты.

---

## 1. Жёсткая валидация `next` (фронт + edge)

В `supabase/functions/_shared/telegramRoute.ts` (и зеркальный `src/lib/telegramRoute.ts`) переписать `safeNextPath` → возвращает `{ value, rejected, reason }`. Запреты:
- Не-строка / пустая → `empty`
- Любой ввод длиннее 1024 символов → `too_long`
- `%2F%2F`, `%5C`, `%00`, `\` → `decoded_traversal` (применяем `decodeURIComponent` дважды, ловим `URIError` → `bad_encoding`, и проверяем результат на запрещённые токены)
- Любая схема кроме path-only — отклоняем кроме случая абсолютного URL c `origin === currentOrigin` (`http(s)` whitelist)
- `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `ftp:` явным regex → `bad_scheme`
- `//`, `\\`, `/\` префиксы → `protocol_relative`
- Сегменты `..`, `.` после нормализации `URL("http://x" + path).pathname` (если отличается от исходного `pathname` → `path_traversal`)
- Запреты на префиксы `/auth/telegram/`, `/api/`, `/functions/` → `disallowed_path`

Аналогично в `safeRedirect`: добавить `too_long`, проверку схемы строго `https:`, отклонение `userinfo` (`u.username || u.password`) → `has_userinfo`, портов кроме 443/пустого → `bad_port`.

В `AuthTelegramDone` и в `telegram-oidc-callback` все отклонения логируем (`console.warn` + insert в `telegram_events`, см. п.2) с полями `{ reason, raw, host?, intent }`.

---

## 2. Метрики: таблица + агрегаты + админ-дашборд

**Миграция** — новая таблица `telegram_events`:

```text
id uuid pk, created_at timestamptz default now(),
kind text       -- 'whitelist_reject' | 'route_decision' | 'next_reject' | 'rate_limited' | 'turnstile_fail'
source text     -- 'oidc-start' | 'oidc-callback' | 'frontend'
reason text     -- 'host_not_allowed' | 'multi_vacancy_profile' | ...
intent text     -- 'employer' | 'candidate' | null
host text, path text, next_path text, vacancy_count int,
ip_hash text, ua_hash text,
meta jsonb default '{}'
```
GRANTs: `SELECT, INSERT` → `service_role` only; `SELECT` → `authenticated` ограничен RLS политикой `has_role(auth.uid(), 'admin')`. Индексы по `(kind, created_at)` и `(reason, created_at)`.

RPC `admin_telegram_metrics(_from timestamptz, _to timestamptz)` (SECURITY DEFINER, проверка `has_role`):
- counts по `kind, reason`
- доли `route_decision` по `reason` (multi_vacancy_profile / single_vacancy_next / no_vacancy_next / fallback_profile)
- top 10 отклонённых host

**Edge:**
- Хелпер `_shared/telemetry.ts` с `logEvent(admin, kind, payload)`; не падает при ошибке записи.
- `telegram-oidc-start` пишет `whitelist_reject`, `next_reject`, `rate_limited`, `turnstile_fail`.
- `telegram-oidc-callback` пишет `whitelist_reject`, `route_decision` (для employer и candidate с `vacancy_count`).

**Фронт:** `AuthTelegramDone` шлёт `route_decision` через RPC `log_telegram_event` (SECURITY DEFINER, принимает только узкий набор kind от authenticated) — чтобы добрать кейсы, когда callback не знает финальный vacancy count.

**Админ-виджет** `src/components/admin/TelegramMetrics.tsx` в `AdminPanel.tsx`:
- Селектор окна (24h / 7d / 30d), вызывает `admin_telegram_metrics`.
- Карточки: total starts, total callbacks, % whitelist reject, % next reject, доли маршрутизации (бар-чарт через `recharts`, уже есть).
- Таблица top-10 reasons и hosts.
- Кнопка-ссылка на сырые Edge Logs в Supabase Dashboard.

---

## 3. Закрытие `/admin`

Гард `AdminGuard.tsx` оборачивает `<Route path="/admin">`. Разрешение:
1. `await supabase.auth.getUser()` → если есть `has_role(uid,'admin')` (RPC) — пускаем.
2. Иначе: `window.self !== window.top` И `document.referrer` начинается с `https://lovable.dev/`, `https://*.lovable.dev/`, `https://*.lovableproject.com/`, `https://*.lovable.app/` (валидация через `new URL(referrer).hostname` + хвостовая проверка) — пускаем в read-only режиме (баннер «Lovable Editor preview»).
3. Иначе → `navigate('/')`.

Проверка референера выполняется один раз при монтировании, кэшируется на сессию (`sessionStorage.lovable_editor=1`), потому что после первого клика внутри SPA `document.referrer` теряется.

Все мутирующие действия в `AdminPanel` (`fetch('/api/admin/...')`) дополнительно проверяют наличие роли — без неё кнопки disabled.

---

## 4. Cloudflare Turnstile + rate-limit

**Turnstile:**
- Build secret/runtime: запросим у вас `TURNSTILE_SITE_KEY` (паблик, в `.env` как `VITE_TURNSTILE_SITE_KEY`) и `TURNSTILE_SECRET_KEY` (runtime secret).
- В `AuthModal.tsx` перед кнопкой Telegram монтируем `<TurnstileWidget>` (через `@marsidev/react-turnstile`), получаем `cf-turnstile-token`, кладём в body `telegram-oidc-start`.
- `telegram-oidc-start` валидирует токен POST-ом на `https://challenges.cloudflare.com/turnstile/v0/siteverify` с IP клиента; при провале → 429 + `telegram_events.turnstile_fail`.

**Rate limit (ad-hoc, edge-level):**
- Таблица `rate_limits(key text pk, window_start timestamptz, count int)`.
- Хелпер `_shared/rateLimit.ts`: `checkAndIncrement(admin, key, limit, windowSec)` атомарно через RPC `rl_hit(_key text, _limit int, _window_sec int) returns boolean`.
- Применяем в `telegram-oidc-start`: ключи `ip:<sha256(ip)>` (10/мин, 60/час) и `tg:<intent>:<ip>` (20/час). В `telegram-oidc-callback`: ключ `cb:<state>` (1/мин — защита от ретраев) и `cb-ip:<ip>` (30/мин).
- Превышение → `429 Too Many Requests` + `rate_limited` event.

Документировать в `<security/security-memory>`: это ad-hoc, не полная защита от распределённой атаки; настоящий L7 DDoS остаётся за провайдером (Cloudflare proxy перед доменом — рекомендуем включить, не входит в скоуп кода).

---

## 5. Расширение тестов `supabase/functions/_shared/telegramRoute_test.ts`

Добавить:
- `safeRedirect`: `https://hr-rr.online:8443` → `bad_port`; `https://user:pass@hr-rr.online` → `has_userinfo`; вход длиной >1024 → `too_long`; пустой hostname / `https:///x` → `parse_error`; `HTTPS://HR-RR.ONLINE/x` (регистр) → accepted.
- `safeNextPath`: `javascript:alert(1)`, `data:text/html,x`, `vbscript:msg`, `/%2e%2e/admin`, `/%2E%2E%2Fadmin`, `/%252e%252e/admin` (double encoded), `/foo%00bar`, `\\evil`, `/\evil`, абсолютный с `userinfo`, отличающийся регистр origin, `next` длиной >1024.
- `chooseCandidateTarget`: `vacancyCount = -1` (мусор) → fallback; `firstPublicId = ''` (пустая строка) → `/main`; `nextPath` = `'/'` + 1 вакансия → ок; проверка, что `nextPath` приоритетнее `profileFallback` только при разрешённом сценарии.
- Параметризованный тест-матрица (через цикл) на построение target из {0,1,2,3} × {null, '/x', '/landing?ref=emp123'} × {null, 'pid'}.

Тесты запускаем `supabase--test_edge_functions` — ожидаемо ~35-40 кейсов, все зелёные.

---

## Технические детали (для разработчика)

- Файлы фронта: `src/lib/telegramRoute.ts`, `src/pages/AuthTelegramDone.tsx`, `src/pages/AdminPanel.tsx`, `src/components/AdminGuard.tsx` (new), `src/components/AuthModal.tsx`, `src/components/admin/TelegramMetrics.tsx` (new), `src/App.tsx`.
- Файлы edge: `supabase/functions/_shared/telegramRoute.ts`, `_shared/telemetry.ts` (new), `_shared/rateLimit.ts` (new), `telegram-oidc-start/index.ts`, `telegram-oidc-callback/index.ts`.
- Миграции: создать `telegram_events`, `rate_limits`, функции `admin_telegram_metrics`, `log_telegram_event`, `rl_hit`. Не забыть `GRANT` блоки и RLS.
- Секреты, которые попрошу добавить: `TURNSTILE_SECRET_KEY` (runtime). `VITE_TURNSTILE_SITE_KEY` — публичный, в `.env` напрямую.
- Зависимость: `bun add @marsidev/react-turnstile`.
- Зеркало `_shared/telegramRoute.ts` ↔ `src/lib/telegramRoute.ts` поддерживаем вручную (комментарий-предупреждение уже есть).

---

## Что я НЕ делаю в этом плане
- Не подключаю Sentry (по вашему выбору).
- Не настраиваю реальный L7 CDN/WAF — это вне кодовой базы.
- Не трогаю существующую логику OIDC (PKCE, обмен кода, magiclink).

После апрува: создам миграции одним блоком, попрошу добавить `TURNSTILE_SECRET_KEY`, потом катну код одним заходом и прогоню расширенные тесты.