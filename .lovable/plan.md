# План: переход на Mini App + новая модель ID, тарифов и реферальной системы

Большая работа, разобью на 6 блоков. Каждый блок — отдельная атомарная миграция/правка, чтобы можно было откатить.

## 1. Новый бот и удаление OAuth-флоу Telegram

- Обновить секреты: `TELEGRAM_BOT_TOKEN` = `8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ`, `TELEGRAM_BOT_USERNAME` = `RoboRecrutBot`. Удалить `TELEGRAM_OIDC_CLIENT_ID` / `TELEGRAM_OIDC_CLIENT_SECRET`.
- Удалить edge-функции `telegram-oidc-start`, `telegram-oidc-callback`, `telegram-auth` (Login Widget), страницу `AuthTelegramDone`, кнопку «Войти через Telegram» в `AuthModal` и на лендинге.
- В `AuthModal` оставить только Google и (опционально) email. Регистрация через Telegram больше не предлагается — только привязка из ЛК.

## 2. Mini App — единственный путь Telegram-входа

Поток (`/?tgWebAppData=...` или прямой запуск из t.me/RoboRecrutBot/app):

```text
TelegramMiniAppBoot
  └─ читает initData (SDK + fallback hash/search)
  └─ POST /telegram-miniapp-auth { initData, startParam }
        backend:
          1. HMAC-валидация initData по BOT_TOKEN
          2. Парсит startParam:
               emp{N}                       → intent=employer, ref=N
               emp{N}com{C}vac{V}           → intent=candidate, employer/company/vacancy
               (пусто)                      → intent=candidate, без привязки
          3. По telegram_id ищет существующего user_id:
               есть  → magiclink → redirect в /employer{id}/profile или /candidate{id}/profile
               нет   → createUser + profile (имя, фамилия, @username, photo_url),
                       создаёт employer или candidate-запись,
                       если employer и первый раз → начислить 500 RR бонус,
                       magiclink → redirect в профиль
- На фронте `TelegramMiniAppBoot` логирует каждый шаг в `telegram_events` / `client_errors`.
- В `AuthCallback` ничего телеграмного больше не обрабатываем.

## 3. Новая схема ID (порядковые с префиксом)

Заменить `public_id` для employers/candidates и добавить публичные ID для companies/projects/interviews/trainings:

| Сущность   | Префикс | Старт   |
|------------|---------|---------|
| employer   | 1       | 100001  |
| candidate  | 2       | 200001  |
| company    | 3       | 300001  |
| vacancy    | 4       | 400001  |
| interview  | 5       | 500001  |
| training   | 6       | 600001  |

Миграция:
- Добавить sequence `public.seq_employer_pid` … `seq_training_pid` со стартом `100001` и т.д.
- Триггеры `BEFORE INSERT` заменяют рандомный `public_id` на `nextval(seq)`.
- Бэкфилл существующих строк по порядку `created_at`.
- Для companies/projects добавить колонки `public_id` (text) если их нет.

## 4. Новые URL-схемы (без транслитерации)

- Компания: `/com{300001}` (страница `CompanyLanding` — резолв по public_id).
- Вакансия: `/com{300001}/vac{400001}` (страница `JobVacancyLanding`).
- Кандидат: `/candidate{200001}/...` (как сейчас).
- Работодатель: `/employer{100001}/...` (как сейчас).
- Реферальная ссылка: `/auth?ref=emp100001`.
- Mini App ссылки в ЛК:
  - employer: `https://t.me/RoboRecrutBot/app?startapp=emp{N}` (кнопка «Привязать Telegram» в профиле).
  - candidate vacancy: `https://t.me/RoboRecrutBot/app?startapp=emp{E}com{C}vac{V}` (в карточке вакансии).
- Обновить `src/lib/links.ts` (builders + resolvers), все ссылки и роуты в `App.tsx`, удалить `companySlug/projectSlug` логику из навигации (slug оставим в БД на чтение, но генерация новых ссылок — по public_id).

## 5. Тарифы, бонусы, реферальная программа

- Бонусы:
  - Регистрация Google → 500 RR (сейчас 1000) — правка `grant_employer_bonus`.
  - Привязка Telegram впервые (employer) → +500 RR — новая функция `apply_telegram_link_bonus`, вызывается из `telegram-miniapp-auth`.
- Реферальная программа: оставляем только для Google-регистраций работодателей. Из `apply_referral_bonus` убрать любые Telegram-ветки. Mini App не вызывает её.
- Прайс (новая таблица `pricing_tiers` или хардкод-конст в `src/lib/pricing.ts`):
  - Лендинг (разовая активация employer): 500 RR (уже включён бонусом).
  - Система интервью: 200 RR.
  - Система обучения: 300 RR.
  - Единый пакет «интервью/обучение»:
    - 1–9 → 200 RR/шт
    - 10–99 → 150 RR/шт
    - 100–999 → 100 RR/шт
    - 1000–9999 → 50 RR/шт
- Списание: при создании interview ИЛИ training-сессии берём 1 единицу из общего «пакета». Обновить триггеры/edge-функции, которые сейчас списывают раздельно.

## 6. Новый калькулятор найма (вместо текущего)

Компонент `HiringCalculator`:
- Input: «Сколько сотрудников нужно».
- Воронка (фиксированные коэффициенты):
  ```text
  выход / 5 = шаг
  Регистрации = need * 10
  Интервью    = need * 6
  Успешные    = need * 2.4
  Обучение    = need * 2
  Прошли      = need
  ```
- Покупаемых единиц = Интервью + Обучение, цена за единицу из тиров.
- Отрисовать **две колонки рядом**: «HR-сотрудник» (4800 ₽/чел, 48 ч) vs «RoboRecrut» (рассчитанная цена, ~2 ч).
- Внизу баннер: «в 6 раз дешевле, в 20 раз быстрее».
- Использовать:
  - на лендинге работодателя (`LandingPage`) — заменяет текущий калькулятор.
  - в ЛК работодателя на странице «Тарифы».

## 7. Лендинг работодателя — новый блок «Почему это выгодно»

Добавить секцию с разбором: лендинг 750 ₽/мес vs 500 ₽ без абонентки, чек-лист от 1500 ₽ vs 200 ₽, обучение 5000 ₽+ vs 300 ₽, час HR 800 ₽ vs 100 ₽. Плюс вывод про кадровые агентства (×10 наценка → 8000 ₽/голова).

## Технические детали

- Edge functions: переписываем `telegram-miniapp-auth`; удаляем 3 функции; добавляем `apply-telegram-bonus` (или inline в miniapp-auth).
- БД-миграции: (a) sequences + триггеры public_id, бэкфилл; (b) изменение `grant_employer_bonus` (1000→500); (c) `apply_telegram_link_bonus`; (d) удаление Telegram-веток из `apply_referral_bonus`; (e) новая таблица `interview_training_units` для единого баланса (если решим хранить в БД, а не считать из transactions).
- Фронт: `links.ts`, `AuthModal.tsx`, `LandingPage.tsx`, `EmployerPanel.tsx` (кнопка «Привязать Telegram», страница «Тарифы»), `CompanyLanding.tsx`, `JobVacancyLanding.tsx`, `App.tsx` (новые роуты `/com:id`, `/com:id/vac:id`), удаление `AuthTelegramDone`, `TelegramMiniAppBoot` упрощается под единственный сценарий.
- `secrets`: обновить `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`; удалить два OIDC-секрета.

## Вопросы перед стартом

1. **Старые ссылки (`/{companySlug}/{projectSlug}/...`)** — оставить как 301-редиректы на новые `/com{id}/vac{id}`, или просто отключить? Старые ссылки уже могли быть расшарены.
2. **Бэкфилл public_id**: пересоздавать ID у уже зарегистрированных employer/candidate (поменяет их URL) или назначать новые ID только новым записям?
3. **Единый «пакет интервью/обучение»** — хранить остаток как отдельный счётчик в `wallets` (например `units_balance`) или продолжать считать через `transactions`? Первое проще, второе — аудит.
4. **Кнопка «Telegram-вход» на лендинге** — полностью убираем, или оставляем как «Открыть в Telegram» (deeplink на `t.me/RoboRecrutBot/app`) для UX?

После ответов начну с блока 1+2 (бот + Mini App), потом ID, потом тарифы/калькулятор.
