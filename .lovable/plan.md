## 1. Калькулятор и прайс — переходим на RR

Файл: `src/components/HiringCalculator.tsx`

- Заменить везде символ `₽` на `RR` (внутренняя валюта, 1 RR = 1 ₽).
- В UI нигде не использовать слово «единиц/units» — только **RR**.
- Сделать коэффициенты «во сколько раз дешевле/быстрее» **динамическими** от значения слайдера `n`:
  - `ratioMoney = hrCost / totalRR` (1 знак после запятой)
  - `ratioTime  = (hrTotalH * 60) / totalMin` (целое)
- Проверка: при `n = 5` должно выйти **×4 дешевле** (4800/1200) и **×27 быстрее** (48·60/107 ≈ 27).
- Блок «Прайс пакетов»: 200/150/100/50 → подписать `RR`.
- Разовые услуги: 500 RR / 200 RR / 300 RR.

## 2. Тексты бонуса — везде «+1000 RR»

Файл: `src/components/AuthModal.tsx`

- Заголовок: **«Бонус при регистрации: +1000 RR на счёт»**.
- Под ним список:
  > Этого хватит на полный AI-цикл найма в пару кликов:
  > 🌐 ИИ-Лендинг вакансии — 500 RR (готовый сайт-визитка с умным чат-консультантом)
  > ⚙️ ИИ-Система Интервью — 200 RR (сценарии, скоринг, ситуативные тесты)
  > 🎓 ИИ-Система Обучения — 300 RR (индивидуальный симулятор онбординга)
- Бейдж на кнопке Google: `+1000 RR` (вместо `+10 ед.`).
- Success-баннер: «Начисляем +1000 RR и перенаправляем в кабинет…».

Файл: `src/pages/LandingPage.tsx`

- В hero-секции упоминание бонуса → **«+1000 RR в подарок»** + тот же список из 3 услуг.

Хелпер: `src/lib/rr.ts` — `unitsToRR(u) = u * 100`. Используется во всех местах вывода баланса. БД-схема не меняется — `wallets.units_balance` хранит единицы, отображаем как RR.

## 3. Настройка Google OAuth + реферальная система

### Часть A. Что я (Lovable) делаю в коде

1. На странице `/auth` и на лендинге читаю `?ref=emp100001` из URL → сохраняю в `localStorage('rr_ref')` **до** клика по Google (после редиректа query теряется).
2. После возврата с Google (появилась `session`) — один раз вызываю edge-функцию `signup-bootstrap`:
  - находит/создаёт строку в `employers` для текущего `auth.uid()`,
  - если есть `rr_ref` и это **первая** регистрация юзера — начисляет **пригласившему** +10 units (= +1000 RR) через `apply_transaction`,
  - идемпотентность через таблицу `referrals_emp(referrer_id, referred_id UNIQUE)`.
3. Новичку бонус +1000 RR начисляет уже существующий триггер `grant_employer_bonus`.
4. Реферальная ссылка в `EmployerPanel` — блок «Поделиться» с готовой ссылкой `https://hr-rr.online/auth?ref=emp{public_id}` и кнопкой «Скопировать».
5. Редирект после Google-входа: `redirectTo: ${origin}/employer/profile` — уже стоит.

### Часть B. Что **тебе** надо сделать руками

**Шаг 1. Google Cloud Console (5 минут)**

1. Открой [https://console.cloud.google.com](https://console.cloud.google.com) → создай проект «HR-RR» (если ещё нет).
2. Слева **APIs & Services → OAuth consent screen**:
  - User type: **External** → Create.
  - App name: `HR Robot Рекрутер`, support email — твой gmail.
  - Authorized domains: `supabase.co`, `hr-rr.online`, `hr-rr.ru`, `lovable.app`.
  - Шаг **Scopes** — просто нажми **Save and Continue**, ничего не добавляй (openid/email/profile выдаются автоматически).
  - Test users → добавь свой gmail → Save.
3. **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
  - Application type: **Web application**.
  - Name: `HR-RR Web`.
  - **Authorized JavaScript origins** — добавь все:
    ```
    https://hr-rr.online
    https://www.hr-rr.online
    https://hr-rr.ru
    https://www.hr-rr.ru
    https://hr-rr.lovable.app
    https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app
    http://localhost:5173
    ```
  - **Authorized redirect URIs** — ровно одна строка:
    ```
    https://rjhtauzookkvlipvqpvr.supabase.co/auth/v1/callback
    ```
  - Create → скопируй **Client ID** и **Client Secret**.

**Шаг 2. Supabase Dashboard (2 минуты)**

1. Открой [https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/auth/providers](https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/auth/providers)
2. Найди **Google** → Enable → вставь Client ID и Client Secret → Save.
3. Слева **Authentication → URL Configuration**:
  - **Site URL**: `https://hr-rr.online`
  - **Redirect URLs** (по одной на строку):
    ```
    https://hr-rr.online/**
    https://www.hr-rr.online/**
    https://hr-rr.ru/**
    https://www.hr-rr.ru/**
    https://hr-rr.lovable.app/**
    https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app/**
    http://localhost:5173/**
    ```
  - Save.

**Шаг 3. Проверка**

1. Инкогнито → `https://hr-rr.online` → «Войти через Google».
2. Должен вернуть на `/employer/profile`.
3. Supabase → Authentication → Users — появилась запись.
4. Таблица `employers` — строка с твоим `user_id` и `public_id` 100xxx.
5. Таблица `wallets` — `units_balance = 10` (= 1000 RR).

**Шаг 4. Тест реферальной ссылки**

1. В кабинете возьми ссылку `https://hr-rr.online/auth?ref=emp{твой_public_id}`.
2. В инкогнито (другой gmail) перейди → войди через Google.
3. У нового юзера: 1000 RR (триггер).
4. У тебя: ещё +1000 RR (edge-функция). Проверь в `wallets` и `transactions`.

**Шаг 5. Прод-режим**

OAuth consent screen → **Publish app** (выйти из Testing), иначе максимум 100 тестовых юзеров и предупреждение «unverified app».

### Технические детали (для меня)

- Новая таблица `referrals_emp(referrer_employer_id, referred_employer_id UNIQUE, created_at)` + GRANTs + RLS (только select своих).
- Edge-функция `signup-bootstrap` (`verify_jwt = false`, JWT валидируется в коде):
  - вход: `{ ref?: string }`,
  - читает `auth.uid()`,
  - находит/создаёт `employers` row,
  - если `ref` валиден (`emp\d+`) и `INSERT ... ON CONFLICT DO NOTHING RETURNING` вставил строку → `apply_transaction(referrer, 'bonus', 10, 'referrals_emp', referral_id, 'Referral bonus')`.
- Конвертер `units → RR` в `src/lib/rr.ts`.
- Калькулятор — чистая клиентская математика, без БД.