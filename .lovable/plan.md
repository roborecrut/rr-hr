## Что строим

Система велком-онбординга для работодателя с пошаговыми всплывающими окнами (driver.js), подсветкой целевого поля и затемнением остального экрана; для каждого поля — иконка «?» с подробным описанием; вся база контента доступна на странице «Вики» и через AI-ассистента.

## База данных

**Таблица `onboarding_content`** — единый реестр контента (источник правды):
- `id` (uuid), `section` (`profile|companies|vacancies|interviews|training|crm|billing`), `field_key` (text, null = welcome раздела), `kind` (`section_welcome|field_help`), `title`, `body_md` (markdown), `selector` (CSS/data-attr, опц.), `order_idx`.
- RLS: SELECT — anon+authenticated (контент публичный, читается Вики/AI/UI). INSERT/UPDATE/DELETE — только service_role.

**Таблица `employer_tour_state`** — кто какой тур прошёл/закрыл:
- `user_id`, `section`, `status` (`pending|completed|dismissed`), `completed_at`.
- RLS: пользователь видит/правит только свои строки.

**Сидинг**: 7 разделов × welcome (1000+ симв.) + 8–12 ключевых полей на раздел (200–400 симв.). Тексты — в фирменном тоне, с примерами и регламентами.

## Frontend

**Зависимость**: `driver.js`.

**Новые файлы**:
- `src/lib/tour/registry.ts` — карта `section → шаги тура` (id, селектор `[data-tour="<section>.<key>"]`, заголовок, описание, позиция).
- `src/hooks/useEmployerTour.ts` — на смену раздела: грузит шаги + статус из БД; если `pending` — запускает driver.js; кнопки «Дальше / Пропустить / Готово» апдейтят `employer_tour_state`.
- `src/components/FieldHelp.tsx` — компактная кнопка «?» рядом с полем; по клику открывает popover с `title + body_md` из `onboarding_content` (кэш через React Query / простой in-memory map).
- `src/components/OnboardingHost.tsx` — провайдер: загрузка контента при входе в `/employer`, подписка на активный раздел, кнопка «Запустить тур заново» в шапке.

**Интеграция в `EmployerPanel.tsx`**:
- Добавить `data-tour="<section>.<key>"` на ключевые элементы каждого раздела (карточки профиля, поля компании, кнопки «Создать вакансию», табы CRM-канбан, поле «Тариф/Пополнить» и т.д.).
- Расставить `<FieldHelp id="<section>.<key>" />` рядом с метками полей.
- Подключить `<OnboardingHost />` один раз в шапке.

**Стилизация driver.js**: переопределяем CSS под бренд (синий градиент `#17344F → #265582`, золотая рамка `#E7C768`, glow) — добавляем в `index.css`.

## Вики и AI

**Страница `/faq` (Вики)**:
- Дополнительная секция «База знаний кабинета» — список из `onboarding_content` сгруппированный по разделам, с поиском и якорями (`#profile-company_name` и т.п.). FAQ-таблица не дублируется — просто дополнительный блок на той же странице.

**`ai-faq-assist` edge-функция**:
- При запросе подтягивает `onboarding_content` (короткие тайтлы + первые 400 симв. body) и подмешивает в system-prompt как «База знаний по кабинету RR». Полные тексты — по запросу через тот же RPC.

**`EmployerAIAssistant`** уже использует `ai-faq-assist` → получит знания автоматически.

## Порядок

1. Migration: 2 таблицы + RLS + seed контента (отдельным `INSERT` блоком в той же миграции).
2. `bun add driver.js`.
3. `src/lib/tour/registry.ts`, `useEmployerTour`, `FieldHelp`, `OnboardingHost` + бренд-CSS.
4. Расставить `data-tour` и `<FieldHelp/>` по 7 разделам `EmployerPanel.tsx`.
5. Обновить `FaqPage` (блок «База знаний кабинета»).
6. Обновить `ai-faq-assist` (подмешивание контента).
7. Сборка/проверка.

## Чего НЕ трогаю

Сам бизнес-функционал кабинета, расчёты RR, Robokassa, CRM-логику, нотификации.
