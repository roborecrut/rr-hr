## Корень проблемы

1. **Роутинг не ловит `/employer{publicId}/profile`**. В `App.tsx` стоит `<Route path="/employer/*">`, который требует слэш после `employer`. Путь `/employeremp-demo/profile` — это один сегмент `employeremp-demo`, он матчится правилом `/:slug` и уходит в `CompanyLanding`, где компании `employeremp-demo` нет → пустая страница. То же самое для `/candidate{publicId}`.
2. **В БД сидится демо с фиксированным `public_id='emp-demo'` / `'693126'`** — то есть «заглушки» теперь буквально записаны в данные. Надо засеять рабочий демо-набор с авто-сгенерированными `public_id` (триггеры это уже умеют).
3. **На лендинге торчат три служебные кнопки** (Панель Работодателя, Кабинет Соискателя, Админ), которые были временными.
4. **Нет режима «войти как кандидат» для админа** — из-за этого нельзя проверить кабинет кандидата.

## План

### 1. Лендинг (`src/pages/LandingPage.tsx`)
- Удалить кнопки `nav_employer`, `nav_candidate`, `nav_admin` и их мобильные аналоги.
- Оставить навигацию: Главная · Каталог Профессий.
- Кнопка **«Личный кабинет RR»** (десктоп и мобайл): открывать `AuthModal`, если пользователь не авторизован; если уже залогинен — резолвить профиль через `resolveProfilePathForUser(user.id)` из `src/lib/links.ts` и переходить туда (employer → `buildEmployerUrl`, иначе candidate). Если у текущего юзера нет ни employer, ни candidate — открывать AuthModal с intent=employer.

### 2. Роутинг (`src/App.tsx`)
- Добавить отдельные маршруты для слитной формы:
  ```text
  /employer:publicId/*   → EmployerPanel
  /candidate:publicId/*  → CandidateFlow
  ```
  React Router v6 поддерживает параметр внутри сегмента (`/employer:publicId`). Параллельно сохранить существующие `/employer`, `/employer/*`, `/candidate`, `/candidate/*` для «без id».
- В `CompanyLanding` (роут `/:slug`) на всякий случай добавить ранний guard: если `slug` начинается на `employer` или `candidate` и совпадает с `/^(employer|candidate)([A-Za-z0-9_-]+)$/` — `navigate(...)` на правильный путь с `/profile`. Это страхует от любых старых ссылок и от закэшированного localStorage.

### 3. БД — пересев демо-данных (через insert-tool, без миграции)
- Удалить старые демо-строки с зашитыми `public_id='emp-demo'`, `slug='ooo-roborekrut-inzhiniring'`, `slug='sales-prod-1'`, `candidates.public_id='693126'`.
- Заново вставить, **не задавая `public_id` и `slug` явно** — пусть триггеры сгенерируют:
  - `companies`: name `«ООО РобоРекрут инжиниринг»`, описание, logo_url, owner_employer_id; slug сгенерится как `ooo-roborekrut-inzhiniring` (триггер `companies_set_slug`).
  - `projects`: role_name `«Менеджер по продажам»`, `is_published=true`, заполнить vacancy_text / motivation / schedule / payouts / team / system / onboarding / mission / stats / checklist + roleplay items.
  - `project_questions`, `training_blocks` + `training_lessons` + `training_quizzes` — минимальный рабочий набор для воронки.
  - `employers`: company_name, без `public_id` (триггер `employers_set_public_id` сгенерит `empXXXXXX`). `user_id = NULL` (демо без владельца).
  - `candidates`: 1 строка, `project_id` = новой вакансии, `current_stage='terms'`, без `public_id` (сгенерится 6 цифр). `user_id = NULL`.
- `companies.owner_employer_id` → проставить на нового демо-employer.
- В CRM работодателя кандидат подтянется автоматически (фильтр по `employer_id` через `projects`).

### 4. Удалить хардкод-фолбэки в коде
- `src/pages/EmployerPanel.tsx`: проверить, что нигде нет литералов `emp-demo` / `693126` / `ooo-roborekrut-...` / `sales-prod-1`. Резолвер `employerId` уже корректный (URL → auth.uid → первый employer из БД), оставляем.
- `src/pages/CandidateFlow.tsx`, `MainCatalogPage.tsx`, `AuthModal.tsx`, `TelegramMiniAppBoot.tsx`: финальный проход `rg` и замена оставшихся литералов на резолвинг из БД через `src/lib/links.ts`.

### 5. Админ-режим «войти как кандидат»
- В `EmployerPanel` на вкладке CRM (рядом с карточкой кандидата) и в шапке профиля добавить кнопку **«Открыть кабинет кандидата как админ»** — показывать только если `has_role(auth.uid(),'admin')` (проверка через `supabase.from('user_roles').select().eq('role','admin')` единожды при загрузке панели; кэшируем в state `isAdmin`).
- Клик:
  1. Резолвим `companies.slug` и `projects.slug` по `candidate.project_id`.
  2. `navigate(buildCandidateUrl(company, project, candidate, 'profile'))` — открывается `CandidateFlow` под реальным URL.
  3. В sessionStorage кладём флаг `rr_admin_impersonate=1`, чтобы CandidateFlow не блокировал доступ из-за чужого `user_id`. В `CandidateFlow` уже идёт загрузка по `public_id` из URL — добавим только баннер «Режим админ-просмотра» сверху и кнопку «Вернуться в панель работодателя».
- Аналогично — кнопка «Открыть лендинг вакансии» (ведёт на `buildVacancyUrl(company, project)`) и «Открыть страницу компании» (`buildCompanyUrl(company)`).
- RLS: у админа уже стоит `has_role(auth.uid(),'admin')` в политиках SELECT на `candidates/projects/companies` (это сделано прошлой миграцией), так что чтение пройдёт.

### 6. Проверка
- Открыть `/` без авторизации → видим только Главная / Каталог / Личный кабинет RR.
- Залогиниться админским email → клик «Личный кабинет RR» → `/employer{realId}/profile`.
- В CRM админа виден демо-кандидат; кнопка «Открыть кабинет кандидата» ведёт на `/ooo-roborekrut-inzhiniring/menedzher-po-prodazham-1/candidate{6цифр}/profile` и страница рендерится.
- Кнопки `Профиль HR / Компании / Вакансии / Тариф / События` ведут на существующие `/{realPublicId}/...` страницы, не на `emp-demo`.

## Открытые вопросы (нет) — план самодостаточен, начинаю править после approve.
