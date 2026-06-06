# Итерация 3 (продолжение) + универсальная загрузка документов

## A. Storage buckets (создаются миграцией один раз)

Через `supabase--storage_create_bucket`:
- `company-uploads` (private) — временные файлы для разбора компании
- `vacancy-uploads` (private) — временные файлы для разбора вакансии
- `training-uploads` (private) — временные файлы для разбора обучающих материалов
- `training-materials` (private) — постоянное хранилище материалов курсов (PDF, видео-превью, доки)

RLS на `storage.objects`:
- INSERT/SELECT/DELETE для аутентифицированного владельца проекта/компании (path prefix `{owner_id}/...`)
- service_role полный доступ (для edge-функций)

Auto-cleanup: edge-функция `ai-ingest-document` после успешного парсинга удаляет файл из `*-uploads`.

## B. Универсальный поток «Загрузить документ → ИИ-разбор»

### Компонент `<DocumentIngestField>` (новый, frontend)
Props: `entity: 'company'|'vacancy'|'training'`, `entityId: uuid`, `value: string`, `onChange(text)`, `onAIDistribute?()`, `maxLength=10000`, `placeholderHint`.

UI:
1. Кнопка «📎 Загрузить файл» (pdf/docx/txt/md, до 10 MB) + кнопка «🎤 Вставить ссылку».
2. Большая textarea (10000 знаков, счётчик), `value` биндится к полю сущности (`companies.about_text` / `projects.{поле}` / `training_blocks.materials_md`).
3. Под textarea — кнопка **«Внести через ИИ»** (видна только когда есть текст). Вызывает `ai-distribute-text` для разнесения по полям.
4. Во время ожидания ответа — анимированный плейсхолдер из массива фраз для текущей сущности (например, для company: «Изучаю миссию…», «Считаю команду…», «Разбираю продукт…»; для vacancy: «Анализирую обязанности…», «Подбираю мотивацию…»; для training: «Готовлю урок…», «Формирую тесты…»). Фразы меняются раз в 2 сек с `fade-in`.

### Edge-функция `ai-ingest-document`
Вход: `{ entity, entity_id, file_path?, file_url?, prompt_hint? }`.
- Если `file_path` (в `*-uploads` бакете) — выписать signed URL (1 час).
- Сформировать промпт под сущность (есть шаблоны для company/vacancy/training).
- Отправить в ProTalk (`_shared/protalk.ts`, callProTalk) с URL и инструкцией «верни оформленный markdown-текст, до 10000 символов».
- Вернуть `{ text }`.
- В finally: удалить файл из storage (`*-uploads`).

### Edge-функция `ai-distribute-text` (новая)
Вход: `{ entity, entity_id, text }`.
- Для `company`: вызывает существующий `ai-company-analyze` (или передаёт raw_text).
- Для `vacancy`: вызывает существующий `ai-enhance` mode `all_vacancy` с `hint: text`.
- Для `training`: вызывает новый `ai-generate-training-material` (см. C).
Возвращает `{ fields }` или `{ block_id }`.

## C. Обучение — edge-функции (B2 из плана)

### `ai-generate-training-material`
Вход: `{ project_id, block_key, source_text?, source_file_url? }`.
- Берёт 15 полей вакансии + `source_text` (если есть).
- ProTalk-промпт: «Сгенерируй учебный материал в markdown (1500–3000 слов) для блока {block_key} по вакансии {role}. Структура: цели → ключевые знания → примеры → чек-лист».
- Пишет в `training_blocks.materials_md`, ставит `ai_generated_at = now()`.

### `ai-generate-training-quiz`
Вход: `{ block_id }`.
- Берёт `materials_md` блока.
- ProTalk-промпт: «Сгенерируй 20 вопросов JSON: 10 choice (вопрос + 4 варианта, 1 правильный, с уклоном в негативные формулировки), 10 text (вопрос + эталон ответа). Каждый по 5 баллов, проходной 70».
- Парсит JSON, удаляет старые `training_questions` блока, вставляет новые. Обновляет `total_score`/`pass_score`.

### `ai-check-text-answer`
Вход: `{ question_id, answer }`.
- Берёт `expected_answer` + `points`.
- ProTalk-промпт: «Оцени ответ кандидата на вопрос. Эталон: …. Ответ: …. Верни JSON {score: 0..points, feedback}».
- Возвращает `{ score, feedback }`.

## D. UI работодателя — «Конструктор обучения» (B3)

Новая вкладка в `EmployerPanel` (внутри карточки вакансии): «Обучение».
Для каждого из 5 блоков (`professional`, `product`, `systems`, `wiki`, `regulations`):
- Карточка с заголовком, прогрессом (есть материал? есть тест? сколько вопросов?).
- Раздел «Материал»: `<DocumentIngestField entity="training">` + кнопка «Сгенерировать материал ИИ» (вызывает `ai-generate-training-material`).
- Раздел «Тест»: список вопросов с inline-редактором (текст, варианты, правильный, баллы). Кнопки: «Добавить вопрос», «Сгенерировать тест ИИ».
- Поле «Проходной балл» + авто-сумма `total_score`.
- Кнопка «Опубликовать блок».

## E. UI кандидата (B4) — кратко, отдельным шагом

В `CandidateFlow` (этап `training`) — список 5 блоков, страница материала (markdown через `react-markdown` + Tailwind prose), страница теста (по 1 вопросу), итог с записью в `candidate_training_progress`.

## Технические детали
- Установить `react-markdown` + `remark-gfm` (~80KB).
- Использовать существующие `_shared/protalk.ts` и шаблон edge-функций (CORS из `_shared/cors.ts`).
- Все новые edge-функции с `verify_jwt = false`, валидация прав внутри (по auth-header → `getUserFromAuthHeader`).
- Промпты для анимированного ожидания — статика в `src/lib/loadingPhrases.ts`.

## Порядок выполнения этой итерации
1. Миграция storage buckets + RLS policies.
2. Установка `react-markdown` + создание `src/lib/loadingPhrases.ts`.
3. Edge-функции: `ai-ingest-document`, `ai-distribute-text`, `ai-generate-training-material`, `ai-generate-training-quiz`, `ai-check-text-answer`.
4. Frontend компонент `<DocumentIngestField>`.
5. Встройка в редактор компании, вакансии (VacancyEditor) — поля верхнего уровня (`about_text`, `responsibilities`, etc.).
6. UI «Конструктор обучения» в `EmployerPanel`.
7. (Следующее сообщение) UI кандидата.

## Открытые вопросы
1. **Лимит хранения файла**: считать ли 10 MB достаточным или нужно больше (видео)?
2. **Видео-материалы** в обучении: только ссылки на YouTube/RuTube или нужна загрузка видео-файлов в `training-materials` (это уже большие объёмы)?
3. **Сразу 5 edge-функций** в одной итерации — ок или дробить по 2?
