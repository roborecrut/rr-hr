
## 1. Полное удаление Telegram

### Удаляем edge functions
- `telegram-auth/`
- `telegram-miniapp-auth/`
- `telegram-webhook/`
- `telegram-config/`
- `telegram-request-contact/`
- `telegram-send/`

И соответствующие записи в `supabase/config.toml`. Секреты `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_OIDC_CLIENT_ID`, `TELEGRAM_OIDC_CLIENT_SECRET` удаляем.

### Удаляем фронтенд-код
- `TelegramMiniAppBoot.tsx` (и его подключение в `App.tsx`/`main.tsx`).
- В `AuthModal.tsx` убрать всё, что связано с Telegram Login Widget и кнопкой быстрого Telegram-входа — остаётся только Google OAuth (+ email/пароль, если используется).
- Из `EmployerPanel.tsx`: блок «Профиль Telegram», кнопка «Запросить телефон через бота», вся реферальная плашка с `t.me/HR_RRbot/app?startapp=...` — заменяется на новую ссылку (см. §5).
- Из `MainCatalogPage.tsx`, лендингов вакансий/компании/работодателя: убрать все кнопки/иконки Telegram-входа.
- Удалить весь Turnstile/капча-код и сопутствующие обёртки.

### БД-миграция (drop)
Удаляем таблицы и связанные объекты:
- `telegram_links`
- `telegram_logs`
- `telegram_events`
- `referrals` (реферальная программа отменена)
- `oauth_states` (использовалась только для Telegram OIDC)
- Функции: `apply_referral_bonus` (обе перегрузки), `referral_lookup`, `get_my_referees`, `get_my_referrer`, `grant_admin_on_tg_link`, `grant_telegram_link_bonus`, `log_telegram_event`, `admin_telegram_metrics`.
- Из `profiles`: колонки `telegram_id`, `telegram_username`, `telegram_first_name`, `telegram_last_name`, `telegram_photo_url`, `telegram_phone`.
- Из `employers`: `telegram_bonus_granted`, `contact_tg`.
- В `handle_new_user` убрать всю Telegram-логику и админ-назначение по telegram_id (остаётся только e-mail админа).

## 2. Лендинг работодателя — оффер

В hero-блоке оставить только кнопку «Войти через Google» и подзаголовок:
«1000 RR в подарок на счёт — этого хватит на полный AI-цикл найма в пару кликов:
— ИИ-Лендинг вакансии — 500 RR
— ИИ-Система Интервью — 300 RR
— ИИ-Система Обучения — 200 RR».

Эти три карточки рендерим под hero.

## 3. Новый калькулятор (на лендинге + на странице «Тарифы» в кабинете)

Контрол: слайдер/инпут «сколько готовых сотрудников нужно» 1–50, default 5. Без месяцев.

Пропорции от выбранного N (для N=5 — числа из ТЗ; масштабируем линейно и округляем):
- Зарегистрировалось = N × 10
- Прошло интервью = N × 6 (× 150 RR за интервью)
- Успешно = N × 2.4
- Вышли на обучение = N × 2 (× 150 RR за обучение)
- Прошли = N

Две колонки:

**Левая «Робот RR»** (минуты, RR):
```
Зарегистрировалось: {N*10} (≈{N*10} мин)
Прошло интервью:   {N*6} = {N*6*150} RR ({N*6} мин)
Успешно:           {N*2.4}
Вышли на обучение: {N*2} = {N*2*150} RR ({N*2} мин)
Прошли обучение:   {N}
Итого: {(N*6 + N*2)*150} RR  •  {N*10 + N*6 + N*2 + N} мин
В пересчёте: {итого_RR / N} RR за готового сотрудника
```

**Правая «Человек HR»** (часы):
```
Пригласили на интервью: {N*12} (≈{N*0.6} ч)
Пришло на интервью:     {N*6} ({N*6} ч)
Успешно:                {N*2.4}
Вышли на обучение:      {N*2} ({N*2} ч)
Прошли обучение:        {N} ({N} ч)
Итого: ~{N*9.6} ч работы HR @ 80 000 ₽ / 160 ч = {N*9.6/160*80000} ₽
Стоимость одного: {…/N} ₽
```

**Сводка снизу**: «×{ratio_money} дешевле и ×{ratio_time} быстрее. Даже HR может вырасти в производительности до ×20.»

## 4. Новый прайс и единый баланс

### Миграция кошельков
- В `wallets` убрать `balance_rr`, оставить только `units_balance` (если не было — добавить).
- В `tx_type` оставляем `topup`/`spend`/`bonus`/`refund`, но `apply_transaction` переписываем под units (целые числа).
- Бонус новому работодателю при регистрации: 10 units (эквивалент 1000 RR / 100 за штуку — округляем). Триггер `grant_employer_bonus` обновить.
- `spend_unit(_candidate, 'interview'|'training')` уже под units — оставляем.

### Прайс пакетов (отображение на странице «Тарифы»)
Один список — пакеты units (универсальные, тратятся на интервью И обучение):
| Пакет | Цена за шт | Сумма |
|------|-----------|-------|
| 1–9 | 200 ₽ | 200–1 800 ₽ |
| 10–99 | 150 ₽ | 1 500–14 850 ₽ |
| 100–999 | 100 ₽ | 10 000–99 900 ₽ |
| 1 000–9 999 | 50 ₽ | 50 000–499 950 ₽ |

Плюс отдельные единоразовые услуги (списываются за каждую созданную вакансию):
- ИИ-Лендинг вакансии — 500 ₽
- ИИ-Система Интервью — 200 ₽
- ИИ-Система Обучения — 300 ₽

На странице «Тарифы» в кабинете показываем тот же калькулятор из §3.

## 5. Новые ID и URL

### Схема ID
Добавляем 6 PostgreSQL последовательностей со стартом со 100001, 200001, … 600001, шаг 1. Триггеры set_public_id переписываем:
- `employers.public_id` ← `'100' || lpad(nextval('seq_employer_pid2')::text,3,'0')`? — нет, проще: префиксов нет, ID — просто число, а буквенный префикс добавляется только в URL (`emp`, `com`, `vac` и т.д.). Тогда:
  - employers: 100001+
  - candidates: 200001+
  - companies: 300001+
  - projects (vacancies): 400001+
  - interviews: 500001+
  - training_blocks: 600001+

### Бэкфилл существующих
Перенумеровываем все существующие записи в новом формате (по порядку `created_at`). Обновляем все ссылки в зависимых таблицах не нужно — `public_id` всегда был просто отображаемым полем; внутренние FK на `id` (uuid) не трогаем.

### Новые URL
- Лендинг компании: `/com{public_id}` (например `/com300001`)
- Лендинг вакансии: `/com{company_pid}/vac{project_pid}` (например `/com300001/vac400001`)
- Личный кабинет работодателя: `/emp{public_id}/...` (уже близко)
- Кабинет кандидата: `/cand{public_id}/...`
- Реферальная ссылка (Google-only): `/auth?ref=emp{public_id}` — но т.к. рефералы отменены в §1, эту ссылку оставляем только как «ваша ссылка-приглашение» без бонусов, либо тоже убираем.

→ **Уточнение:** в ТЗ упоминается `?ref=emp100001`, но рефералы удалены. **Я удалю реферальный код полностью** — если нужно, добавим позже.

### Редиректы
В `App.tsx` (React Router) добавить catch-all обработчик старых URL:
- `/:companySlug` → ищем company по `slug`, если найдена → `Navigate` на `/com{public_id}`.
- `/:companySlug/:projectSlug` → аналогично.
- Старые `/employer{pid}/...` где pid в старом формате — ищем в новой колонке `legacy_public_id` (которую сохраним при миграции) → редирект на новый URL.
Слаги в БД оставляем как `legacy_slug` / `legacy_public_id` для редиректов, поиск идёт сначала по новому формату.

### Файлы фронта
- `src/lib/links.ts`: `buildCompanyUrl`, `buildVacancyUrl`, `buildCandidateUrl`, `buildEmployerUrl` переписать под новые префиксы.
- Все компоненты, которые строят URL (`CompanyLanding`, `JobVacancyLanding`, `EmployerPanel`, `CandidateFlow`, `MainCatalogPage`, и т.д.), используют эти хелперы — менять не придётся.
- Маршруты в `App.tsx`: добавить новые `/com:cid`, `/com:cid/vac:vid`, `/emp:eid/*`, `/cand:cid/*` + legacy-редиректы.

## 6. Прочая чистка

- Удалить весь код Turnstile/капчи и связанные секреты (TURNSTILE_SECRET_KEY).
- Из `handle_new_user` и из БД-функций убрать ссылки на `telegram_*` поля.
- Удалить ENV-переменные/UI про Mini App и WebApp.

---

## Технические детали (по разделам)

**Порядок миграций (одной за раз):**
1. Создать новые последовательности, добавить колонки `legacy_public_id`/`legacy_slug`, скопировать туда текущие значения.
2. Перенумеровать все таблицы (employers, candidates, companies, projects, interviews, training_blocks) по `created_at ASC` через `WITH numbered AS (...) UPDATE ...`.
3. Переписать триггеры `*_set_public_id` под новые последовательности.
4. Удалить Telegram-таблицы, функции, колонки. Удалить `referrals`, `oauth_states`.
5. Изменить `wallets`/`apply_transaction` под units-only, поправить `grant_employer_bonus` (10 units вместо 1000 RR).
6. Обновить `handle_new_user` — без Telegram.

**Файлы кода к изменению (примерный список):**
- delete: `src/components/TelegramMiniAppBoot.tsx`, все `supabase/functions/telegram-*`
- edit: `src/App.tsx`, `src/main.tsx`, `src/components/AuthModal.tsx`, `src/components/SegmentDispatcher.tsx`, `src/pages/LandingPage.tsx`, `src/pages/MainCatalogPage.tsx`, `src/pages/EmployerPanel.tsx`, `src/pages/CompanyLanding.tsx`, `src/pages/JobVacancyLanding.tsx`, `src/pages/CandidateFlow.tsx`, `src/pages/AdminPanel.tsx`, `src/lib/links.ts`, `supabase/config.toml`
- new: `src/components/HiringCalculator.tsx` (общий компонент для лендинга и кабинета), `src/pages/RedirectLegacyCompany.tsx`, `src/pages/RedirectLegacyVacancy.tsx`

**Открытые вопросы (отвечу по ходу, если возникнут):**
- Цена RR в рублях при покупке units — берём «1 unit = 1 интервью/обучение», цена пакетом по §4.
- Бонус 1000 RR на лендинге: формулировка остаётся «1000 RR», в БД зачисляем 10 units; либо переименуем «RR» → «единиц». Уточню при реализации в копирайте.
