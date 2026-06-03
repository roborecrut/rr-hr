## Цель

1. Везде в боте и при регистрации использовать `https://hr-rr.online` вместо `https://hr-rr.online`.
2. Включить регистрацию кандидатов через Telegram (быстрый вход + миниапп) с сохранением Telegram-данных в профиле.

## 1. Замена домена `hr-rr.online` → `hr-rr.online`

### Frontend
- `src/pages/EmployerPanel.tsx:3558,3564` — ссылка быстрого входа `https://hr-rr.online/auth?ref=...` → `https://hr-rr.online/auth?ref=...`.
- Остальные места (`CompanyLanding`, карточки проектов, реф-блок) уже используют `hr-rr.online` — не трогаем.
- В демо-миграции `20260603195316_...sql` адрес `demo@hr-rr.online` — миграции read-only, оставляем (это просто email демо-работодателя, не домен бота).

### Edge-функции
- В коде `telegram-auth`, `telegram-miniapp-auth`, `telegram-webhook` нет хардкода `hr-rr.online` (magic-link использует `SUPABASE_URL` + текущий origin). Проверим, что в `redirectTo` не зашит `hr-rr.online`; если есть — заменим.

### План в `.lovable/plan.md`
- В шагах BotFather: `/setdomain @HR_RRbot` → ввести **`hr-rr.online`** (а также добавить `www.hr-rr.online`). `/setmenubutton` → `https://hr-rr.online`.

### Действия пользователя (BotFather, вручную)
1. `/setdomain` → `@HR_RRbot` → `hr-rr.online`
2. `/setmenubutton` → `@HR_RRbot` → URL `https://hr-rr.online` → текст `Открыть RR`

## 2. Регистрация кандидатов через Telegram

Сейчас:
- `AuthModal` дёргает `telegram-auth` с жёстко зашитым `intent: "employer"` — кандидат не может войти быстрой кнопкой.
- `TelegramMiniAppBoot` уже шлёт `intent: "candidate"` — но `apply_referral_bonus` корректно игнорирует кандидатов (бонус только работодателю-другу).
- Поля `telegram_first_name/last_name/photo_url/phone/username/id` уже есть в `profiles` и заполняются `telegram-auth` / `telegram-miniapp-auth` независимо от роли. Отдельной таблицы под кандидатов не требуется — данные Telegram живут в `profiles` (одно на пользователя).

### Изменения

**AuthModal**
- Добавить пропс/состояние `intent` (employer | candidate). На лендинге кандидата открывать модалку с `intent="candidate"`, в кабинете работодателя — `employer` (как сейчас).
- Передавать выбранный `intent` в тело запроса `telegram-auth` и в `signInWithOAuth` (Google).
- Кнопка «Войти через Telegram» становится доступна и для кандидата.

**Лендинг/диспетчер**
- `SegmentDispatcher` / `LandingPage` (кандидатская часть): подключить кнопку быстрого Telegram-входа с `intent="candidate"` и поддержать `?ref=<empPublicId>` в URL (сохраняется как `ref_source` у кандидата для аналитики, RR не начисляется).

**TelegramMiniAppBoot**
- Логика остаётся: `intent: "candidate"` по умолчанию. Если `start_param` начинается с префикса работодательской регистрации (например `emp_<public_id>` или сценарий «зарегистрироваться как работодатель из миниаппа»), переключаем на `employer`. Для простоты сейчас — оставить `candidate` всегда; работодатель регистрируется отдельно через кабинет/кнопку.

**Профиль кандидата**
- В странице кандидата (если есть `CandidatePanel`/`CandidateProfile`) показать блок «Telegram-профиль» с теми же полями, что у работодателя: аватар, имя+фамилия, кликабельный `@username` или `tg://user?id=...`, телефон (`tel:` ссылка) с кнопкой «Запросить через бота» (вызов существующего `telegram-request-contact`). Если страницы профиля кандидата ещё нет — добавим компактный блок в шапку личного кабинета кандидата.

**База данных**
- Схема `profiles` уже содержит все нужные поля — миграция не требуется.
- Никаких новых полей в `candidates` не добавляем (Telegram-данные у пользователя, а не у заявки на вакансию). Если пользователь явно хочет дубль полей в `candidates` — уточним отдельно.

**Реферальная система для кандидатов**
- `apply_referral_bonus` намеренно начисляет RR только при регистрации **работодателя** через ref работодателя. Для кандидата по ref-ссылке `https://t.me/HR_RRbot/app?startapp=<empPublicId>` запишем `profiles.ref_source = <empPublicId>` (или в `candidates.ref_source`), без начисления RR. Это даёт работодателю аналитику «откуда пришёл кандидат», но без двойных бонусов.

## Технические детали

Файлы к правке:
- `src/pages/EmployerPanel.tsx` — 2 строки (`hr-rr.online` → `hr-rr.online`).
- `src/components/AuthModal.tsx` — пропс `intent`, проброс в Telegram/Google.
- `src/pages/LandingPage.tsx` / `SegmentDispatcher.tsx` — открытие AuthModal с `intent="candidate"` и сохранение `?ref=`.
- `src/components/TelegramMiniAppBoot.tsx` — комментарий/доки; кода менять минимум.
- `supabase/functions/telegram-auth/index.ts` — принять `intent` из тела (если ещё нет) и положить в `raw_user_meta_data.intent`, чтобы `handle_new_user` повесил роль `candidate` корректно.
- `supabase/functions/telegram-miniapp-auth/index.ts` — то же самое (уже почти есть).
- Страница профиля кандидата — добавить Telegram-блок (если страница существует; иначе вынесем в следующий этап).
- `.lovable/plan.md` — обновить инструкции BotFather на `hr-rr.online`.

Миграции БД: **не требуются**.

## Открытые вопросы
1. Подтвердить, что **не** нужно дублировать Telegram-поля в `candidates` (они уже есть в `profiles`).
2. Есть ли уже страница «кабинет кандидата», куда вставить Telegram-блок, или сделать минимальный `CandidateProfile`?
