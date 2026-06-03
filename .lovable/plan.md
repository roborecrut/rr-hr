## Проблема

В коде зашиты заглушки: `emp-demo`, `ooo-roborekrut-inzhiniring`, `sales-prod-1`, `cand-1`, `693126`. Они используются как fallback в URL и в `/api/*`-фетчах. При этом БД пуста (employers, candidates, companies, projects — 0 строк), а старые `/api/*` эндпоинты не существуют — реально доступны только Supabase-таблицы + edge functions.

Цель: построить ссылки из реальных данных БД, засеять рабочий демо-набор и дать вам админский доступ к редактированию.

## Схема URL → источник в БД

| Сегмент | Что значит | Источник |
|---|---|---|
| `/{companySlug}` | страница компании | `companies.slug` |
| `/{companySlug}/{projectSlug}` | страница вакансии | `projects.slug` (внутри `companies`) |
| `/{companySlug}/{projectSlug}/{candPublicId}/{tab}` | кабинет кандидата | `candidates.public_id` |
| `/employer{employerPublicId}/{tab}` | кабинет работодателя | `employers.public_id` |
| `/candidate{candPublicId}/{...}` | альт. кабинет кандидата | `candidates.public_id` |

В БД таблицы `companies` и `projects` уже имеют поле `slug`. У `employers` и `candidates` нужен короткий публичный ID — добавим колонку `public_id`.

## Шаги

### 1. Миграция БД

- Добавить `employers.public_id TEXT UNIQUE` (формат `emp-xxxx`, генерится триггером из `lower(left(company_name)) + nanoid(4)` либо `emp` + 6 hex, если пусто).
- Добавить `candidates.public_id TEXT UNIQUE` (6-значное число, генерится триггером).
- Триггер автозаполнения `slug` для `companies` и `projects` при insert/update, если пусто (транслит RU→LAT + `-` + индекс при коллизии).
- Хелперы: `public.slugify_ru(text)` (immutable), `public.gen_employer_public_id()`, `public.gen_candidate_public_id()`.
- Backfill: проставить `public_id`/`slug` существующим (пока пустым) строкам.
- В `user_roles` добавить роль `admin` для второго email/tg (см. вопрос ниже).

### 2. Сидинг демо-данных (через insert-tool)

Сначала создать auth-пользователей для демо невозможно из insert-tool, поэтому демо-employer и демо-candidate привязываем к `user_id = NULL` (поле уже не required в большинстве таблиц — уточню перед миграцией) либо к моему `auth.uid()` при первом входе. План:

- `companies`: 1 запись `name='ООО РобоРекрут инжиниринг'`, `slug='ooo-roborekrut-inzhiniring'`, owner = ваш будущий employer.
- `projects`: 1 запись `slug='sales-prod-1'`, `role_name='Менеджер по продажам'`, `is_published=true`, привязка к компании.
- `project_questions` / `training_blocks`/`lessons`/`quizzes`: минимальный набор для воронки.
- `candidates`: 1 запись `public_id='693126'`, привязка к проекту, `current_stage='terms'`.
- `employers`: 1 запись `public_id='emp-demo'`, привязка к компании.

Если `user_id NOT NULL` — добавлю в миграцию `user_id` nullable для демо-строк и RLS-политику «admin видит/правит всё» (через `has_role(uid,'admin')`), чтобы вы могли работать с демо до полноценной регистрации.

### 3. Хелперы ссылок (frontend)

Создать `src/lib/links.ts`:

```ts
buildCompanyUrl(company)            // /{slug}
buildVacancyUrl(company, project)   // /{slug}/{projectSlug}
buildCandidateUrl(company, project, cand, tab?, sub?)
buildEmployerUrl(employer, tab?)
```

Все компоненты ходят только через них — никаких `"ooo-roborekrut-..."`/`"sales-prod-1"`/`"emp-demo"` в коде.

### 4. Замена источников данных

- `EmployerPanel`:
  - Резолв `employerId` так: 1) если в URL есть `/employer{publicId}` — ищем по `employers.public_id`; 2) иначе по `auth.uid()` из supabase-сессии. Никаких `emp-demo` в fallback.
  - Заменить `fetch('/api/employers/...')`, `/api/companies`, `/api/projects`, `/api/candidates`, `/api/admin/payments`, `/api/telegram-logs`, `/api/ai-status` на прямые SELECT через `supabase.from(...)` с фильтрами по `employer_id`.
  - Все `navigate(...)` строятся через `buildEmployerUrl(...)` / `buildVacancyUrl(...)`.

- `CandidateFlow`:
  - Парсить URL: `/{companySlug}/{projectSlug}/{candidatePublicId}/...`. Грузить кандидата через `supabase.from('candidates').select(...).eq('public_id', candPublicId)`, проект — по `slug`, компанию — по `slug`.
  - Fallback на `candidates.public_id` из сессии (если зашёл по `/candidate/...`).
  - `getDynamicPath()` использует реальные `companySlug`/`projectSlug`, без `"ooo-roborekrut-inzhiniring"`.

- `CompanyLanding` / `JobVacancyLanding`:
  - Грузить `company by slug`, `project by id|slug` через supabase. Убрать дефолты-заглушки.

- `MainCatalogPage`, `LandingPage`, `AuthModal`, `TelegramMiniAppBoot`:
  - При выборе вакансии/компании строить ссылку через `buildVacancyUrl`/`buildCandidateUrl`, используя `public_id`/`slug` из загруженной строки.
  - В резолверах после логина (`resolveProfilePath`) брать `employers.public_id` или `candidates.public_id` вместо UUID.

### 5. Админ-доступ из интерфейса Lovable

- `handle_new_user` уже даёт `admin` для `shishkarnem@gmail.com` и Telegram `169262990`. Добавим в этот же триггер ваш дополнительный аккаунт (нужно подтверждение, какой именно — см. вопрос).
- RLS-политики на `employers/companies/projects/candidates` и связанные таблицы: добавить `USING (has_role(auth.uid(),'admin'))` для SELECT/UPDATE/DELETE, чтобы из кабинета admin мог открыть и править любую демо-сущность.
- В UI EmployerPanel: если `has_role(admin)`, разрешить выбирать `employerId` из выпадашки (вместо строгой привязки к своему `auth.uid()`), чтобы открыть `/empemp-demo/...` и редактировать.

### 6. Удаление мусора

- Удалить хардкоды `"sales-prod-1"`, `"ooo-roborekrut-inzhiniring"`, `"emp-demo"`, `"cand-1"`, `"693126"` из `.tsx`.
- Удалить мёртвые `fetch('/api/...')`, заменить на supabase-вызовы или (для AI) `supabase.functions.invoke('ai-*')`.

## Открытый вопрос (1 шт.)

Какой дополнительный аккаунт давать админом для редактирования из интерфейса Lovable? Варианты:
- (a) только текущие `shishkarnem@gmail.com` + TG `169262990` — ничего не добавляем;
- (b) добавить ещё один email (укажите);
- (c) добавить ещё один Telegram ID (укажите).

После ответа выполняю миграцию + сидинг + рефакторинг ссылок.
