## 1. Раздел «Обучения» — список систем + кнопка «Создать»

Сейчас `TrainingWizard.tsx` сразу показывает выпадающий список вакансий — переделать по аналогии с вакансиями:

- В `EmployerPanel` (вкладка `training`) рендерить новый компонент `TrainingList`:
  - Карточки всех созданных систем обучения (одна система = один `project_id` с непустыми `training_blocks`/`training_stage_tests`).
  - На карточке: название вакансии, компания, статусы этапов (материал/тест есть/нет), кнопка «Открыть редактор».
  - Сверху кнопка «➕ Создать систему обучения» → открывает `TrainingWizard` в режиме редактора.
- В `TrainingWizard`:
  - Шаг 0 (только при создании новой) — обязательный выбор вакансии. Без выбора кнопка «Сохранить» дизейблится, как в визарде вакансий.
  - При открытии существующей системы вакансия фиксирована (можно сменить только через «Создать новую»).
  - Правило «одна система на вакансию» уже есть на уровне БД (по `project_id+stage`); добавить проверку: если для выбранной вакансии система уже есть — предложить «Открыть существующую» вместо дубля.

## 2. Автоподгрузка 5 базовых текстов в этапы + галочки контекста

5 полей вакансии уже хранятся: `training_intro_text`, `training_professional_text`, `training_product_text`, `training_systems_text`, `training_regulations_text` (+ `training_wiki_text`).

В `TrainingWizard` при выборе вакансии:
- Подгрузить эти 5 текстов и показать панель «Источники контекста для ИИ» с чекбоксами (по умолчанию все ✓):
  - ☑ Введение, ☑ Профессиональный, ☑ Продуктовый, ☑ Системный, ☑ Регламенты.
  - ☑ Дополнительный загруженный файл (если `source` не пуст).
- При вызове `ai-generate-stage-material` передавать новый параметр `context_keys: string[]` — какие из текстов включать.
- В edge-функции `ai-generate-stage-material/index.ts`:
  - Расширить `body` полем `context_keys?: string[]`.
  - Формировать `ctx[]` только из отмеченных ключей (вместо текущей жёсткой логики «по этапу»). По умолчанию (если не передано) — текущее поведение.
  - Учитывать вакансию: `role_name`, `responsibilities`, `requirements`, `conditions`, `motivation` подгружать всегда.
- Аналогичные галочки + `context_keys` пробросить в `ai-generate-stage-test` (чтобы тест строился по выбранным источникам, а не только по `materials_md`).

## 3. Переименовать кнопки распознавания файлов

Везде «Отправить в ProTalk / Отправить документ в ProTalk» → «Распознать текст»:
- `src/components/DocumentIngestField.tsx` строки 178, 187.
- `src/components/DocumentUploader.tsx` строка 264 («Распознать документ» → «Распознать текст») и тексты подсказок (строки 75, 234, 243).
- `src/pages/EmployerPanel.tsx` строки 3378, 3383, 3404 (надписи зоны загрузки в визарде компании).
- Затрагивает редактор/создание вакансий, компаний, блоков обучения и интервью (один компонент `DocumentIngestField` используется во всех).

## 4. Поля пожеланий

В `TrainingWizard` (рядом с генераторами):
- `<textarea>` «Пожелания к материалу» (до 1000 симв.) — значение в state `wishesMaterial`, передавать в `ai-generate-stage-material` как `wishes`.
- `<textarea>` «Пожелания к тесту» (до 1000 симв.) — `wishesTest`, передавать в `ai-generate-stage-test` как `wishes`.

В обеих edge-функциях добавить блок в промпт: `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${wishes}` (только если непусто, slice(0,1000)).

## 5. Редактирование вопросов + лимит 30

В `TrainingWizard.tsx` (блок «Тест по этапу»):
- Кнопка ✕ у каждого вопроса → удаление из `test.questions`.
- Две кнопки «➕ Текстовый вопрос» и «➕ Вопрос с вариантами»:
  - Текстовый: `{ id: nanoid, kind:"text", question:"", expected_answer:"", points:5 }`.
  - Choice: `{ id, kind:"choice", question:"", options:[{text:"",is_correct:true},{text:""},{text:""},{text:""}], points:5 }`.
- Лимит: кнопки добавления дизейблятся при `questions.length >= 30`; счётчик «N/30».
- В `InterviewWizard.tsx` (чек-лист) — такой же лимит 30:
  - Кнопки «Добавить вопрос» уже есть (по `Plus`-иконкам), убедиться что они дизейблятся при `checklist.length >= 30`.
  - Удаление вопросов уже работает (Trash2).
- В edge-функциях (`ai-generate-stage-test`, `ai-generate-interview-checklist`, `ai-generate-training-quiz`) поменять `slice(0, 20)` → `slice(0, 30)` и в схему промпта изменить «РОВНО 20» → «до 30 (10 choice + 10 text, можно больше при необходимости, не превышая 30)». Текущая дефолтная генерация остаётся 20 — лимит только ограничивает сверху.

## Техническая сводка

Файлы:
- `src/components/TrainingWizard.tsx` — режим редактора, выбор вакансии при создании, контекст-чекбоксы, пожелания, add/delete вопросов, лимит 30.
- `src/components/TrainingList.tsx` (новый) — карточки систем + кнопка «Создать».
- `src/pages/EmployerPanel.tsx` — переключение между списком и редактором, замена текстов «ProTalk» на «Распознать текст».
- `src/components/DocumentIngestField.tsx`, `src/components/DocumentUploader.tsx` — переименование кнопок и подсказок.
- `src/components/InterviewWizard.tsx` — лимит 30.
- `supabase/functions/ai-generate-stage-material/index.ts` — поддержка `context_keys`, `wishes`.
- `supabase/functions/ai-generate-stage-test/index.ts` — `context_keys`, `wishes`, лимит 30.
- `supabase/functions/ai-generate-interview-checklist/index.ts` — лимит 30.
- `supabase/functions/ai-generate-training-quiz/index.ts` — лимит 30.

БД-миграции не требуются — все нужные поля уже есть.
