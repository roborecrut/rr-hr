## Что меняется (по пунктам пользователя)

### 1. Заголовок мастера
- `src/pages/EmployerPanel.tsx` → блок с `Конструктор вакансии с поддержкой Gemini API` (стр. 2184) переименовать в **«Мастер Вакансий»**. Иконка/стиль как у мастера компаний.

### 2. Справочник должностей в БД
- Новая таблица `public.job_titles`:
  - `id uuid pk default gen_random_uuid()`
  - `title text not null unique` (case-insensitive по `lower(title)`)
  - `usage_count int default 0`
  - `is_basic boolean default false` (для сидинга)
  - `created_by uuid null` (auth.uid())
  - `created_at timestamptz default now()`
- GRANT: `SELECT` для `anon, authenticated`; `INSERT/UPDATE` только для `authenticated`; `ALL` для `service_role`. RLS: чтение всем, вставка/инкремент только аутентифицированным.
- RPC `public.job_title_upsert(_title text)` (SECURITY DEFINER) — нормализует пробелы, делает upsert, инкрементит `usage_count`, возвращает строку.
- Сид: вставить все 70 позиций из `BASIC_SPECIALTIES` с `is_basic=true`.
- В мастере вакансий и `MainCatalogPage.tsx` заменить `BASIC_SPECIALTIES` на загрузку из БД (`select … order by usage_count desc, title`). Поле фильтра, чипы, и кнопка «➕ Добавить свою профессию» — оба места.
- При выборе/вводе своей профессии вызывать `job_title_upsert`. При сохранении вакансии — тоже (для роста `usage_count`).
- `src/types.ts`: оставить `BASIC_SPECIALTIES` только как fallback на случай ошибки загрузки.

### 3. Открытие мастера вакансии как у компаний
- Добавить RPC `public.project_create_draft(_company uuid)` по аналогии с `company_create_draft`: создаёт `projects` со `status` (если есть) и пустыми полями, возвращает `{id, public_id}`. (В таблице `projects` нет колонки `status` — драфт определяется по `is_published=false` и пустому `role_name`. Уже подходит: добавлять статус не нужно.)
- В `openAddVacancyWizard` (новая функция) при клике «+ Добавить вакансию»:
  1. RPC создаёт черновую запись `projects` для выбранной компании.
  2. Сразу зовём `aiRestart(employerId)` с логом в `AIDialogPanel`.
  3. Открываем форму мастера, поля сброшены.
- Кнопка «Отмена/Закрыть» — `cancelAddVacancyWizard`: если пользователь ничего не ввёл (роль пустая, тексты пустые), удаляем драфт из `projects`. Иначе оставляем как незаконченный.

### 4–5. Все поля лендинга вакансии в мастере + кнопка «Оформить красиво» в шапке
- Текущий мастер закрывает только: компания, должность, оплата, график, custom_wiki, логотип. Расширить до полного набора колонок `projects`:
  - `vacancy_text` (Обязанности/Требования/Условия — одно поле с подзаголовками внутри текста, как сейчас в `VacancyView`. В подсказке мастера указать формат и лимиты символов.)
  - `tasks_activity_text` (формат `[Таб] Описание`)
  - `schedule_text`, `payouts_text`, `motivation_text`, `motivation_text_detail`
  - `onboarding_text` (см. п.8)
  - `team_text`, `system_text`
  - `salary_terms`, `schedule_terms` — оставить
  - Уроки/обучение (`training_*`) пока не трогаем (это отдельный режим).
- Каждое поле — `textarea` с `maxLength`, кнопкой ✨ (`handleEnhanceSingleField` по аналогии с компанией), серверный лимит уже выставлен в `ai-enhance/index.ts` (нужно добавить `vacancy_text=1500`, `tasks_activity_text=1000`, `onboarding_text=800`, `team_text=600`, `system_text=600`).
- Шапка карточки мастера: слева заголовок «Мастер Вакансий», справа кнопка **«✨ Оформить красиво с помощью ИИ»** (вызывает `handleBeautifyNewVacancyWithAI`, который передаёт **все** поля + правила оформления в `ai-enhance` mode `all_vacancy`) и рядом крестик «✕». Старую кнопку «Оформить красиво» снизу убираем.
- В edge-функции `ai-enhance` системный промт для `all_vacancy` обновить под список всех полей и правил длины.

### 6. Кнопка «Сохранить и синхронизировать»
- Заменить «Создать систему адаптации и форму соискателя» на **«Сохранить и синхронизировать»**.
- В обработчике (`handleCreateOnboardingSystem` → переименовать в `handleSaveVacancyWizard`):
  - Обновить запись `projects` (UPDATE по `draftProjectId`) всеми полями мастера.
  - Вызвать `job_title_upsert` для введённой должности.
  - Установить `is_published=true`.
  - Закрыть форму, вызвать `fetchProjects()`.
  - Сделать `navigate("/emp{public_id}/vacancies")` (если не на ней) и проскроллить наверх.
- Генерацию уроков/ситуаций НЕ запускать здесь. Для этого на карточке вакансии в списке оставить отдельную кнопку «Сгенерировать адаптацию» (использует существующий `ai-generate-onboarding`).
- Карточки вакансий уже выводятся в `grid grid-cols-1 md:grid-cols-2` (стр. 2418) — обновим, чтобы после сохранения список перезагружался из БД (`fetchProjects` + сброс локального кэша).

### 7. Убрать загрузку логотипа вакансии
- Удалить блок `setupLogoUrl` (input + кнопка загрузки + превью) из мастера. На лендинге `JobVacancyLanding` уже используется `row.logo_url || row.companies?.logo_url` — оставить только companies.logo_url. В `EmployerPanel` при сохранении не передавать `logo_url`.

### 8. Полный набор подразделов
Все эти поля уже есть в таблице `projects` (`onboarding_text`, `team_text`, `system_text`, `schedule_text`, `payouts_text`, `tasks_activity_text`, `motivation_text*`). Нужно:
- В мастере добавить секции с подсказками и шаблонами по умолчанию:
  - **Vacancy**: подзаголовки «Пул задач», «Требования», «Ежедневный процесс» (3 таба `tasks_activity_text`).
  - **Schedule**: график + тайм-слоты.
  - **Motivation**: бонусы/преимущества.
  - **Payouts**: схема выплат.
  - **Onboarding**: дефолтный шаблон с этапами «Интервью → Кейс-тест → Обучение → Стажировка → Выход на работу» и блок про типы оформления (Самозанятость, ИП, ТК РФ, ГПХ).
  - **Team**: отделы и сотрудники (формат `[Отдел] Имя — роль`).
  - **System**: табы с регламентами (формат `[Раздел] Описание`).
- В `VacancySections.tsx`: расширить `OnboardingView` и `TeamView` парсингом тех же шаблонов.
- Добавить блок **«Контакты для связи»** (п. 12) на лендинге вакансии — читается из `employers.contact_email/contact_phone/contact_telegram`. Новый компонент `VacancyContactsSection` в `VacancySections.tsx`, отображается в боковой колонке и в подвале.

### 9. ИИ-консультант
- В `CompanyLanding.tsx` — не показывать чат-консультанта (он сейчас может всплывать через `JobVacancyLanding`-подобный код; убрать ссылки/кнопки).
- В `JobVacancyLanding.tsx`:
  - Подключить к существующей edge-функции `ai-chat` (ProTalk). Контекст промта — собрать строку из всех полей вакансии + компании из БД (роль, оплата, график, vacancy_text, schedule_text, payouts_text, onboarding_text, team_text, system_text, motivation_text, company.name/description/products/mission). Системный промт: «Ты консультант по вакансии {role} компании {name}. Отвечай ТОЛЬКО на основе данных ниже.»
  - При открытии страницы — `aiRestart` для уникального `chatId` (по `projectId`), чтобы диалог был свежим под конкретную вакансию.
  - Ввод текста и кнопка «Отправить» — рабочие.
  - Анимация ожидания: spinner + три точки (используем `animate-pulse`).
  - Стриминг 30 симв/сек на клиенте: после получения полного ответа от `ai-chat` запускаем typewriter в `useEffect` (setInterval на `setMessages` с подстановкой `text.slice(0, i)`). Disable кнопку отправки во время typewriter.

### 10. Регистрация кандидата с привязкой к вакансии
- В `JobVacancyLanding.tsx` форма заявки уже знает `project.id` и `companyId`. В `CandidateAuthModal` / RPC `candidate_email_signup` уже принимаются `_project` и `_company`. Проверить, что при OAuth/email-входе всегда передаются.
- Для существующих кандидатов с тем же email — RPC `candidate_email_signup` сейчас отвечает `email_taken`. Изменить: если email уже есть, не создавать дубль, а добавить **новую запись `candidates`** с тем же `email`/`user_id` для другой вакансии/компании (или вторую запись по project_id+email). Проще всего: снять unique-проверку и просто создавать новую строку для каждой пары `(email, project_id)`.
- В личном кабинете кандидата (`CandidateFlow.tsx`) добавить переключатель «Мои отклики»: список всех `candidates` по email, с переходом к нужной компании/вакансии.

### 11. Данные вакансии и компании в кабинете кандидата
- В `CandidateFlow.tsx` добавить подгрузку `projects` + `companies` по `candidate.project_id/company_id` и вывести разделы:
  - «О вакансии» — `vacancy_text`, оплата, график.
  - «О компании» — `description_text`, `mission_text`, logo.
  - «Команда» / «Система работы» / «Онбординг» — соответствующие тексты, если заполнены.
- Если каких-то подстраниц нет — добавить простые табы в шапке кабинета.

### 12. Контакты работодателя на лендинге
- Реализовано в п.8 (`VacancyContactsSection`): `email`, `phone`, `telegram` из `employers` по `employer_id` вакансии.

## Технические детали

```text
DB migrations:
  - CREATE TABLE public.job_titles (...)
  - GRANT + RLS + policies (read=anon/auth, write=auth/service_role)
  - CREATE FUNCTION public.job_title_upsert(_title text) ... SECURITY DEFINER SET search_path=public
  - CREATE FUNCTION public.project_create_draft(_company uuid) ... SECURITY DEFINER
  - Seed BASIC_SPECIALTIES (70 строк) с is_basic=true
  - (Опционально) добавить в employers: ничего; уже есть contact_email/phone/telegram

Frontend:
  - src/pages/EmployerPanel.tsx — переписать блок мастера вакансий (~2180-2415)
    + новые state: draftProjectId, все *_text поля, enhancingFieldsVac
    + новые функции openAddVacancyWizard, cancelAddVacancyWizard, handleSaveVacancyWizard,
      handleEnhanceVacancyField, handleBeautifyVacancyWizardAll
    + удалить старые setupLogoUrl
    + обновить fetchJobTitles() — заменить BASIC_SPECIALTIES
  - src/pages/MainCatalogPage.tsx — заменить локальный список на БД-список, использовать job_title_upsert
  - src/pages/JobVacancyLanding.tsx
    + подключить ai-chat (уже есть в supabase/functions/ai-chat)
    + typewriter эффект
    + блок контактов работодателя
    + загрузка полного contextа вакансии
  - src/pages/CompanyLanding.tsx — убрать триггеры открытия AI-консультанта
  - src/components/VacancySections.tsx — расширить OnboardingView, TeamView, SystemView; добавить VacancyContactsSection
  - src/pages/CandidateFlow.tsx — список «Мои отклики» + подразделы с данными вакансии/компании
  - supabase/functions/ai-enhance/index.ts — расширить LIMITS, обновить system prompt для all_vacancy
```

## Что НЕ делаем в этом плане
- Не трогаем существующие платежи/кредиты и `purchase_*` RPC.
- Не меняем дизайн карточек компаний.
- Не запускаем автоматически генерацию уроков из мастера вакансий (по решению пункта 6).
- Не реализуем настоящий SSE-стриминг ProTalk — typewriter на клиенте.
