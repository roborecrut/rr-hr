# План: фиксы редактора вакансии + Итерация 3 (Обучение)

## Часть A. Фиксы карточек вакансии (быстрые, 1 итерация)

### A1. Шаблоны привязаны к выбранной должности
Сейчас `getRoleTemplates(setupRoleName)` загружается один раз и кнопка «Шаблон» в `VacancyEditor` всегда подставляет `field.example` (дефолт для «Менеджер по продажам»).
- В `VacancyEditor` добавить проп `roleTemplates?: Partial<Record<VacancyFieldKey, string>>`.
- Кнопка «Шаблон» теперь подставляет `roleTemplates[key] ?? field.example`.
- Добавить кнопку **«Сброс»** (очистить поле) рядом с «Шаблон» и «AI».
- В create-режиме при смене `setupRoleName` подгружать шаблоны и **перезаписывать все 15 полей** значениями `roleTemplates[key] ?? field.example` (с подтверждением, если в форме уже что-то введено вручную).
- В edit-режиме (см. A3) — то же самое при смене должности.

### A2. Кнопки «Удалить вакансию» и «Отмена создания»
- В карточке редактирования (`handleSaveEditedProject` форма): добавить красную кнопку «Удалить вакансию» → confirm → `supabase.from('projects').delete().eq('id', editing.id)` → закрыть карточку, обновить список, аудит-лог.
- В карточке создания (wizard): кнопка «Отмена» → если был создан черновик (`project_create_draft`) — удалить его из БД, закрыть мастер, сбросить состояние.

### A3. Смена компании/должности в карточке редактирования
- В редактор (mode="edit") добавить тот же блок «Компания + Должность» что и в wizard'е (autocomplete по `companiesList` и `jobTitlesList`).
- При смене должности — подгрузить шаблоны (`getRoleTemplates`) и предложить перезаписать поля.
- При смене компании — обновить `company_id` и `companyName` в `editing`.
- Сохранение этих полей идёт в общем `handleSaveEditedProject`.

## Часть B. Итерация 3 — Страница «Обучение для кандидатов»

### B1. Схема БД (миграция)
Расширяем `training_blocks` + новые таблицы:

```
training_blocks (already exists, расширить):
  + materials_md        TEXT      -- развёрнутый материал в markdown
  + materials_links     JSONB     -- [{title, url, kind: 'video'|'doc'|'link'}]
  + materials_files     JSONB     -- [{name, storage_path, mime, size}]
  + pass_score          INT       -- проходной балл (например 70)
  + total_score         INT       -- сумма баллов по тесту (автосчёт)
  + ai_generated_at     TIMESTAMP

training_questions (новая):
  id, block_id (FK), order_no,
  kind: 'choice'|'text',
  question TEXT, 
  options JSONB,          -- для choice: [{text, is_correct}]
  expected_answer TEXT,   -- для text: эталон для ProTalk
  points INT DEFAULT 1,
  explanation TEXT
```
Storage bucket: `training-materials` (private, RLS — только владелец проекта).

### B2. Edge-функции
- `ai-generate-training-material` — на вход block_key + 15 полей вакансии → markdown-материал (1500–3000 слов, с заголовками, списками, примерами).
- `ai-generate-training-quiz` — на вход материал → 20 вопросов: 10 негативных choice («Что НЕ является…») + 10 text. Чёткая JSON-схема.
- `ai-check-text-answer` (ProTalk) — проверяет текстовый ответ кандидата против `expected_answer`, возвращает `{ score, feedback }`.

### B3. UI работодателя: «Конструктор обучения»
Новая вкладка/секция в `EmployerPanel` → «Обучение вакансии {role}». Для каждого из 6 блоков (профессия, продукт, системы, wiki, регламенты, мотивация — выровнять с 5 training-полями + общий «Адаптация»):
- Кнопка «Создать материал ИИ» → markdown-редактор (react-md-editor или textarea с preview).
- Загрузка файлов (`storage`), добавление видео-ссылок.
- Кнопка «Сгенерировать тест» → 20 вопросов в редакторе:
  - Для choice: вопрос + 4 варианта (radio, отметка правильного), баллы.
  - Для text: вопрос + эталон + баллы.
- Поле «Проходной балл», авто-сумма total_score.
- Все правки сохраняются в `training_blocks` / `training_questions`.

### B4. UI кандидата
В `CandidateFlow` (этап `training`) — для каждого блока:
- Подстраница `/training/{block}` с красиво оформленным markdown-материалом (Tailwind prose), список файлов/видео.
- Подстраница `/training/{block}/quiz` — 20 вопросов, по одному на экран; choice проверяется локально, text → `ai-check-text-answer`.
- Итог: набранные баллы vs проходной; запись в `candidate_training_progress` (расширить `score`, `passed`, `answers JSONB`).

### B5. Цены/лимиты
Использовать существующий `spend_fixed(_project, 'training_setup')` — генерация всех 6 блоков за одно списание (300 RR из `purchase_fixed`).

## Технические детали (не для пользователя)
- Markdown: `@uiw/react-md-editor` (~50KB) или `react-markdown` + textarea для редактора.
- Storage RLS: `storage.objects` policy `is_project_owner(project_id)` через path-prefix `{project_id}/...`.
- AI вызовы — через существующий `LOVABLE_API_KEY` + ProTalk для проверки текстовых.

## Порядок выполнения
1. **Сейчас**: A1 + A2 + A3 (~1 итерация, чисто фронт + 1 удаление).
2. **Следом (Итерация 3, шаг 1)**: миграция БД из B1 + storage bucket.
3. **Итерация 3, шаг 2**: edge-функции B2.
4. **Итерация 3, шаг 3**: UI работодателя B3.
5. **Итерация 3, шаг 4**: UI кандидата B4.

## Вопросы перед стартом
1. По удалению вакансии — мягкое (флаг `archived`) или жёсткое `DELETE`?
2. В Итерации 3 — оставляем ровно 5 блоков обучения (из 15 полей) или добавляем 6-й «Мотивация и онбординг»?
3. Markdown-редактор: `@uiw/react-md-editor` (WYSIWYG-подобный) или простой textarea + live-preview справа?
