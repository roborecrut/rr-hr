## Что меняем в Мастере Вакансий (/empXXX/vacancies)

### 1. Подсказки вместо placeholder
Сейчас примеры скрыты в `placeholder` и пропадают при вводе. Переделаем:
- Под label каждого поля выводим небольшой блок «Пример заполнения» (свернутый по умолчанию, разворачивается по клику «Показать пример»).
- Само текстовое поле **предзаполняется** этим примером при создании черновика вакансии (если поле пустое).
- Пример всегда виден рядом, даже когда пользователь редактирует значение.

### 2. Шаблоны привязаны к должности
- В таблицу `job_titles` добавляем JSONB-колонку `field_templates` — словарь `{ vacancy_text, tasks_activity_text, schedule_text, motivation_text, motivation_text_detail, payouts_text, onboarding_text, team_text_vac, system_text_vac }`.
- Для базовых 70 должностей сидируем дефолтные шаблоны (текущие placeholder’ы как стартовая база; для топ-должностей — более точные тексты).
- При выборе должности в мастере вакансий:
  - Если поле пустое → подставляем шаблон из `job_titles.field_templates`.
  - Поле «Пример» всегда показывает шаблон выбранной должности.
- Если пользователь добавляет новую должность (через upsert) — после первого сохранения вакансии её поля сохраняются как шаблон (`field_templates`) для этой должности, если шаблона ещё нет.

### 3. Передача шаблона в ИИ
- В edge-функции `ai-enhance` (режимы `single` и `all_vacancy`) добавляем поле `template` — приходит с клиента, содержит шаблон поля(ей) для выбранной должности.
- В system-промпт добавляется блок «Эталон заполнения для роли X», ИИ ориентируется на структуру, формат и стиль шаблона.
- Кнопки ✨ (улучшить поле) и «Оформить красиво» подгружают шаблоны и передают их в `ai-enhance`.

### 4. Объединение и удаление полей в мастере вакансий
- «График работы» + «График и тайм-слоты» → одно поле **«График работы и тайм-слоты»** (`schedule_text`).
- «Условия оплаты» + «Схема выплат» → одно поле **«Оплата и схема выплат»** (`payouts_text`).
- Поле **«Регламенты и база Wiki для обучения кандидата»** убираем из мастера вакансий. Содержимое (если было) переезжает в Мастер Обучения как стартовый шаблон.

## Мастер Обучения (/empXXX/training)

### 5. Структура и привязка
- Новая страница-мастер по образцу Мастера Вакансий: заголовок **«Мастер Обучения»**, шаги, поля с примерами, кнопки ✨ и «Оформить красиво».
- Обучение **прикрепляется к вакансии**: на странице есть селектор «Вакансия», список из `projects` текущего работодателя. Один курс на одну вакансию (1:1).
- На карточке вакансии в /vacancies добавляем кнопку **«📚 Открыть Мастер Обучения»**, ведёт на `/empXXX/training?project=<id>`.

### 6. База данных
- Используем существующие таблицы `training_blocks` и `training_lessons` для хранения, но добавляем в `projects` колонку `training_published boolean default false`.
- В `projects` уже есть `trainingProfText/trainingProductText/trainingSystemText` — используем их + новые поля для мастера: `training_wiki_text`, `training_regulations_text`, `training_intro_text`.
- Шаблоны полей обучения тоже хранятся в `job_titles.field_templates` под префиксом `training_*`.

### 7. Поля мастера обучения (с примерами и ✨ ИИ)
- Вводная (для кого курс, цели)
- Профессиональное обучение (теория профессии)
- Обучение продукту/компании
- Обучение процессам и системе (CRM, регламенты)
- База Wiki / регламенты (то, что убрали из вакансии)
- Финальный кейс/аттестация (опционально)

### 8. Доступ к лендингу обучения
- **Курс НЕ публикуется на публичном URL.** Доступ только из личного кабинета кандидата.
- В `CandidateFlow.tsx` добавляем вкладку/этап **«📚 Обучение»**.
- Видимость: вкладка появляется только если `candidate.current_stage IN ('training','certified')` или интервью пройдено успешно (`candidate_scores.overall_score >= порог` ИЛИ `current_stage != 'terms'/'interview'`).
- Контент берётся из `training_blocks`/`training_lessons` по `project_id` кандидата.

### 9. Кнопка генерации обучения
- В мастере обучения кнопка **«Сохранить и сгенерировать курс»** → вызывает существующий `ai-generate-onboarding` (передаём поля мастера + шаблон должности), результат пишется в `training_blocks/training_lessons`.
- После генерации редирект на `/empXXX/training` со списком курсов по вакансиям.

## Технические детали

```text
DB migration:
  ALTER TABLE job_titles ADD COLUMN field_templates jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE projects ADD COLUMN training_published boolean DEFAULT false,
                       ADD COLUMN training_wiki_text text,
                       ADD COLUMN training_regulations_text text,
                       ADD COLUMN training_intro_text text;
  + сидирование шаблонов для 70 базовых должностей (job_titles.field_templates)
  + RPC job_title_get_templates(_title text) RETURNS jsonb
  + RPC job_title_save_templates(_title text, _templates jsonb)  -- SECURITY DEFINER, owner-only

Client:
  src/lib/jobTitles.ts:
    + fetchJobTitleTemplates(title) → возвращает field_templates
    + saveJobTitleTemplates(title, patch) → upsert при первом сохранении
  src/pages/EmployerPanel.tsx (Мастер Вакансий):
    - удалить поля «График работы», «Регламенты и база Wiki», старое «Условия оплаты»
    - объединить дубли (schedule_text, payouts_text)
    - заменить placeholder на блок <FieldExample> под label
    - при изменении должности подгружать шаблоны и предзаполнять пустые поля
    - в onEnhance/onBeautify передавать template
  src/pages/EmployerPanel.tsx (вкладка training):
    + новый раздел «Мастер Обучения» с теми же паттернами
    + селектор вакансии, кнопка «Сохранить и сгенерировать»
  src/pages/CandidateFlow.tsx:
    + вкладка «📚 Обучение», условный рендер по стадии

Edge:
  supabase/functions/ai-enhance/index.ts:
    + accept body.template; вставлять в system-prompt
    + расширить LIMITS для training_* полей
```

## Что НЕ меняется
- Структура `candidates`, `companies`, лендинг вакансии, авторизация — без изменений.
- Существующая логика «Сохранить и синхронизировать», ProTalk — без изменений (только расширяется контекст).
