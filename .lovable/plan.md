## Цель
Починить вход через Telegram («Bot domain invalid»), добавить реферальную программу со ссылкой `t.me/HR_RRbot/app?startapp={emp_public_id}` (+1000 RR обоим), забирать профильные данные Telegram (ID, имя, фамилия, аватар, @username, телефон) и выводить их в кабинете работодателя.

---

## Что вы сделаете руками (один раз)
В @BotFather:
1. `/setdomain` → выбрать `@HR_RRbot` → ввести `hr-rr.ru`
2. (Опционально для тестов в редакторе) повторить и добавить `id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app`
3. `/setmenubutton` → `@HR_RRbot` → URL `https://hr-rr.ru` → текст `Открыть RR`

Без шага 1 Login Widget на проде работать не будет — это требование Telegram.

---

## План работ

### 1. БД: миграция
- В `profiles` уже есть `telegram_id`, `telegram_username`. Добавить колонки `telegram_first_name`, `telegram_last_name`, `telegram_photo_url`, `telegram_phone`.
- Расширить `referrals`: добавить колонку `referred_user_id uuid` и unique-индекс `(owner_user_id, referred_user_id)` для идемпотентности.
- Функция `public.apply_referral_bonus(_referrer_public_id text, _new_user uuid)` (SECURITY DEFINER): находит работодателя-реферера по `public_id`, находит нового работодателя по `_new_user`, проверяет что это первая регистрация и оба — работодатели, затем `apply_transaction(..., 'bonus', 1000, ...)` обоим и пишет запись в `referrals`.
- Триггер `grant_employer_bonus` уже даёт +1000 RR любому новому работодателю — оставить как есть. Реферальные +1000 — поверх.

### 2. Edge-функции

**`telegram-auth`** (Login Widget) и **`telegram-miniapp-auth`** (Mini App) — в обеих:
- Принимать `ref` (Login Widget) / читать `start_param` из initData (Mini App) — это `public_id` реферера.
- Сохранять в `profiles` все поля: `telegram_first_name`, `telegram_last_name`, `telegram_photo_url`, `telegram_username`, `telegram_id` (через ON CONFLICT UPDATE).
- Создавать запись `employers` только если intent=employer (как сейчас), но реферальный бонус — только если намерение employer.
- После создания пользователя и employer-строки — вызов `apply_referral_bonus(ref, user_id)`.

**`telegram-webhook`** (новая или расширение существующей):
- Обрабатывать `/start <emp_public_id>` (deep-link из кнопки «Поделиться»).
- Обрабатывать сообщения с `contact` (после нажатия reply-keyboard «Поделиться номером») — сохранять `telegram_phone` в `profiles` по `telegram_id`.

**Новая `telegram-request-contact`** (вызывается из кабинета):
- Принимает user_id → находит `telegram_id` → шлёт через бота сообщение с reply-keyboard `request_contact: true` и текстом «Нажмите кнопку, чтобы привязать номер».

### 3. Frontend

**`AuthModal.tsx`**:
- Передавать `ref` в `telegram-auth` (уже частично есть через `query.ref`) — без изменений логики, только убедиться что приходит.
- Подсказку «Если виджет не загрузился — откройте по реф-ссылке `t.me/HR_RRbot?start=...`» как fallback.

**`TelegramMiniAppBoot.tsx`**:
- Читать `Telegram.WebApp.initDataUnsafe.start_param` и передавать как `ref` в `telegram-miniapp-auth`.

**Кабинет работодателя — новый блок «Telegram-профиль»** (в `EmployerPanel` вкладка «Профиль»):
- Аватар (telegram_photo_url), имя+фамилия, кликабельный `@username` → `https://t.me/{username}`, если нет username — кнопка-ссылка `tg://user?id={telegram_id}`.
- Поле «Телефон»: если есть — `tel:` ссылка; если нет — кнопка «Запросить телефон через бота» → вызывает `telegram-request-contact`. Подсказка: «Перейдите в чат с @HR_RRbot и нажмите кнопку — номер появится здесь автоматически».

**Кабинет работодателя — блок «Реферальная программа»**:
- Показывает реф-ссылку `https://t.me/HR_RRbot/app?startapp={employer.public_id}` с кнопками «Скопировать» и «Поделиться» (Telegram Web Share).
- Счётчик: сколько друзей-работодателей зарегистрировалось по ссылке и сколько RR начислено (запрос к `referrals` по `owner_user_id`).

### 4. Реальный поток бонусов
- Любой новый работодатель → триггер `grant_employer_bonus` → +1000 RR (приветственный).
- Если при регистрации передан валидный `ref` (public_id существующего работодателя) → дополнительно +1000 RR новому и +1000 RR рефереру через `apply_referral_bonus`.
- У кандидатов кошелька нет — реф-бонус не начисляется, регистрация по реф-ссылке кандидатом просто игнорируется (запись в `referrals` без транзакций).

---

## Технические детали

- `botUsername` из `telegram-config` уже возвращает `HR_RRbot` — менять не нужно.
- `start_param` в Mini App доступен в `window.Telegram.WebApp.initDataUnsafe.start_param` (Telegram передаёт его при открытии по `?startapp=...`).
- Для получения телефона в Telegram единственный надёжный способ — `KeyboardButton.request_contact`, отправляется через Bot API в личном чате. В Login Widget и initData телефона нет.
- Webhook `telegram-webhook` уже зарегистрирован? Если нет — после деплоя нужно один раз вызвать `setWebhook` через connector gateway или Bot API (укажу команду после реализации).
- `verify_jwt = false` для `telegram-webhook` в `supabase/config.toml`.

---

## Что НЕ делается
- Не трогаются роуты/слаги (сделано в прошлой итерации).
- Не меняется логика кандидатов.
- Привязка телефона из Google не добавляется (вы не просили).
