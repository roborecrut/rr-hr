## Цель

1. На странице `/employer<public_id>/profile` показывать список приглашённых по реферальной ссылке (Telegram + Google) с именем, фамилией, e-mail, ссылкой на Telegram и аватаркой.
2. В профиле тех, кто зарегистрировался по чужой ссылке (работодатель и кандидат), показывать карточку «Вы пришли по приглашению от …» с теми же данными.
3. Провести аудит регистрации через Telegram (OIDC) для работодателя и кандидата, включая динамические лендинги вакансий/компаний, и закрыть найденные риски.

---

## Часть A. Реферальный список в профилях

### A1. БД: расширяем таблицу `referrals`

Сейчас `apply_referral_bonus` пишет строку в `referrals` только для пары работодатель→работодатель (там, где есть `v_new_emp`). Кандидатские регистрации по ссылке не фиксируются вообще.

Миграция:
- `ALTER TABLE public.referrals ADD COLUMN referee_kind text NOT NULL DEFAULT 'employer' CHECK (referee_kind IN ('employer','candidate'))`.
- `ALTER TABLE public.referrals ADD COLUMN intent text` — копия `intent` из `oauth_states` (для отчётности).
- Переписать `apply_referral_bonus(_referrer_public_id, _new_user, _intent)`:
  - всегда вставляет строку в `referrals` (идемпотентно по `used_by_user_id`),
  - `reward_rr = 1000` и `apply_transaction(..., bonus, 1000)` только когда `_intent='employer'` И у нового пользователя есть employer-строка,
  - для `_intent='candidate'` — `reward_rr = 0`, бонус не начисляется, но факт регистрации сохранён.

### A2. БД: SECURITY DEFINER функции для чтения

```sql
create or replace function public.get_my_referees()
returns table(
  used_by_user_id uuid,
  referee_kind text,
  created_at timestamptz,
  reward_rr numeric,
  display_name text,
  email text,
  google_email text,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  telegram_photo_url text,
  avatar_url text,
  registered_via text
) language sql stable security definer set search_path=public as $$
  select r.used_by_user_id, r.referee_kind, r.created_at, r.reward_rr,
         p.display_name, p.email, p.google_email,
         p.telegram_username, p.telegram_first_name, p.telegram_last_name,
         p.telegram_photo_url, p.avatar_url, p.registered_via::text
  from public.referrals r
  join public.profiles p on p.id = r.used_by_user_id
  where r.owner_user_id = auth.uid()
  order by r.created_at desc
$$;
```

И симметричная `get_my_referrer()` — возвращает 0 или 1 строку с теми же полями, плюс `owner_public_id` (employers.public_id владельца).

`GRANT EXECUTE ... TO authenticated`. RLS на `profiles` обходить не приходится, потому что функция `SECURITY DEFINER`.

### A3. Фронт: `src/components/ReferralsList.tsx` (новый)

- Вызывает `supabase.rpc('get_my_referees')`.
- Рендерит список карточек: аватарка (telegram_photo_url || avatar_url || инициалы), имя (telegram_first_name + last_name || display_name), бейдж «Telegram/Google», e-mail (`google_email || email`), ссылка `https://t.me/<telegram_username>` если есть, дата регистрации, начисленный RR.
- Пустое состояние с подсказкой «поделитесь ссылкой `?ref=<public_id>`».
- Встраиваем в `EmployerPanel.tsx` в секцию профиля рядом с уже существующим блоком `referralStats` (около строки 134/720).

### A4. Фронт: `src/components/ReferredByCard.tsx` (новый)

- Вызывает `supabase.rpc('get_my_referrer')`.
- Если запись есть — карточка «Вы зарегистрировались по приглашению» с теми же полями и ссылкой на профиль владельца (`/employer<owner_public_id>/profile`).
- Встраиваем в `EmployerPanel.tsx` (профиль работодателя) и в `CandidateFlow.tsx` (профиль кандидата, рядом с его данными).

---

## Часть B. Аудит регистрации через Telegram OIDC

### B1. Передача `ref` для всех веток

В `AuthModal.tsx` уже шлём `ref: query.ref || ""` в `telegram-oidc-start`. Проверить и поправить:
- В `JobVacancyLanding.tsx` и `CompanyLanding.tsx` при открытии `AuthModal` (intent='candidate') проверить, что `useRouter().query.ref` действительно прокидывается — оба лендинга монтируются под динамическими путями `/<companySlug>/<projectSlug>` и `/<companySlug>`. Если `RouterContext` парсит query из `window.location.search`, всё уже работает; если нет — пробросить вручную через props.
- Подстраховаться: если `query.ref` пуст, читаем `new URLSearchParams(window.location.search).get('ref')` и `localStorage.getItem('rr_ref')` (последнее сохраняем при первом заходе на любой лендинг — это закроет случай, когда юзер ушёл на oauth.telegram.org и потерял query).

### B2. `telegram-oidc-start`

- Принимать и сохранять в `oauth_states`: `intent`, `ref`, `redirect_to` (полный URL лендинга, не только origin), `landing_slug` (опционально — для кандидата, чтобы знать, куда вернуть).
- Валидация `redirect_to`: пускать только URL с хоста из белого списка (`hr-rr.online`, `hr-rr.ru`, `*.lovable.app`, `*.lovableproject.com`). Без этого — open redirect.

### B3. `telegram-oidc-callback`

Проверить/починить:
1. **Передача `intent` в `apply_referral_bonus`.** Сейчас функция вызывается только для employer; после правки A1 — вызывать всегда, передавать `intent`.
2. **Создание `telegram_links` с `intent`.** Колонка `intent` в `telegram_links` уже есть — убедиться, что записывается и используется при поиске (`telegram_id + intent`), иначе работодатель и кандидат с одним TG ID будут конфликтовать.
3. **Профиль кандидата.** Для `intent='candidate'` НЕ создавать employer-строку и НЕ начислять бонус 1000 RR (это для работодателей). При этом всё равно писать `referrals`-строку с `referee_kind='candidate'`.
4. **Редирект.** Возвращать пользователя на `redirect_to` (лендинг вакансии/компании), а не всегда на `/`. Magic-link хэш отдаём в `<redirect_to>/auth/telegram/done#...&next=<encoded redirect_to>`.
5. **JWKS-кэш.** Убедиться, что обработка `kid` и ротации не падает — на холодном старте функция должна перезагружать JWKS при unknown kid.
6. **Обработка ошибок Telegram токен-эндпоинта.** Логировать тело ответа, возвращать понятный редирект `/auth/telegram/done?error=...`.
7. **Чистка `oauth_states`.** Удалять запись после успеха и при ошибке; добавить запас по TTL (cron можно отложить — пока проверять `created_at > now() - interval '10 min'` на чтении).

### B4. `AuthTelegramDone.tsx`

- После `verifyOtp` уметь читать `next` из hash и редиректить кандидата обратно на лендинг (`/<companySlug>/<projectSlug>`), а не только в `/main`. Если `next` отсутствует — текущее поведение (`resolveProfilePathForUser`).
- Показ ошибок: `error=expired|invalid_state|telegram_token_failed|jwks_failed`.

### B5. Кандидат на динамическом лендинге

Сценарий, который надо протестировать вручную после деплоя:
1. Открыть `/<companySlug>/<projectSlug>?ref=emp123456` (вакансия).
2. Нажать «Войти через Telegram» → OIDC → возврат на `/auth/telegram/done` → редирект обратно на лендинг.
3. В `candidates` появилась строка с правильным `project_id`/`landing_slug`/`ref_source='emp123456'`.
4. В `referrals` появилась строка `referee_kind='candidate'`, `reward_rr=0`, `owner_user_id` = владелец `emp123456`.
5. В кабинете работодателя `emp123456` в `ReferralsList` появилась карточка нового кандидата.

Аналогично для работодателя на главной (`/?ref=emp123456` → AuthModal intent='employer'): кандидат в списке + 1000 RR обоим.

---

## Технические детали для билд-режима

- Файлы под изменение/создание:
  - новая миграция (часть A1+A2),
  - `supabase/functions/telegram-oidc-start/index.ts` (B2),
  - `supabase/functions/telegram-oidc-callback/index.ts` (B3),
  - `src/components/AuthModal.tsx` (B1: ref fallback),
  - `src/pages/AuthTelegramDone.tsx` (B4),
  - `src/components/ReferralsList.tsx` (новый),
  - `src/components/ReferredByCard.tsx` (новый),
  - `src/pages/EmployerPanel.tsx` (встроить оба компонента),
  - `src/pages/CandidateFlow.tsx` (встроить `ReferredByCard`),
  - `src/pages/JobVacancyLanding.tsx`, `src/pages/CompanyLanding.tsx` (сохранение `ref` в localStorage при заходе).

- Безопасность:
  - RLS на `referrals` остаётся; новые функции `SECURITY DEFINER` отдают только данные, привязанные к `auth.uid()`.
  - Whitelist редиректов в OIDC-start, чтобы исключить open-redirect.
  - В `apply_referral_bonus` сохранить идемпотентность по `used_by_user_id`.

- Что НЕ трогаем: Mini App auth, Google OAuth, webhook, send-message, telegram-config.

После твоего «ок» — переключусь в build mode и пройду шаги в порядке: миграция → правка двух edge-функций → компоненты → встраивание в страницы → ручной чек-лист B5.
