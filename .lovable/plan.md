## Цель

Сделать единый глобальный компонент загрузки документов (как сейчас в редакторе/мастере компаний — он работает корректно), и использовать его во всех редакторах/создателях. Начинаем с мастера и редактора **вакансий**, так как там сейчас сломан flow и стиль не соответствует.

## Что не так сейчас

- В вакансиях используется свой кастомный inline-блок (`src/pages/EmployerPanel.tsx`, ~стр. 1870–2940): свой upload в `vacancy-uploads`, своя кнопка «Распознать документ», свой textarea `vacancyRawText`, своя кнопка «Оформить красиво» — стиль и поведение отличаются от компании.
- Компонент `src/components/DocumentIngestField.tsx` уже почти то, что нужно (Apple Glass, brand-editor, кнопки brand-secondary/gold, шаги Upload → ProTalk → Distribute), но: кнопка «Оформить красиво» прижата справа, нет mascot-окна во время генерации, нет режима «без авто-distribute» (когда мастер сам потом дернёт `ai-enhance`).
- Ошибка ProTalk `400 Bad Request` на signed URL воспроизводится именно во вкладке вакансий, потому что путь/имя файла собираются вручную и иногда отдаются ProTalk до того, как Storage реально отдал файл. В компании этот же flow работает потому, что использует `ai-ingest-document` + signed URL из admin-клиента и сразу читает текст (а не «отложенно» по второй кнопке).

## Что делаем

### 1. Единый компонент `DocumentUploader`

Превращаем `DocumentIngestField.tsx` в полноценный глобальный компонент (новое имя `src/components/DocumentUploader.tsx`, старый файл становится тонкой обёрткой для обратной совместимости):

Props:
- `entity: "company" | "vacancy" | "training" | "interview" | "resume"` → выбирает bucket, промпт ingest и тексты подсказок.
- `entityId: string`
- `value: string`, `onChange(text)` — содержимое распознанного markdown.
- `maxChars` (по умолчанию 5000 для вакансии/компании, 10000 для training).
- `onDistributed?` — опционально; если задан, показываем кнопку «Оформить красиво через ИИ» (по центру).
- `enhanceMode?: "distribute" | "external"` — `external` означает «не дёргать `ai-distribute-text`, просто отдать текст наружу через `onDistributed(null)` / коллбек `onEnhanceClick`», что нужно мастеру вакансий (он сам вызывает `ai-enhance` со всеми полями).
- `title`, `hint`, `accept` — для конкретной формы.

Поведение (как сейчас в компании):
1. Шаг 1 — кнопка «Загрузить файл» (brand-secondary) или «Вставить ссылку». Имя файла санитизируется до ASCII (как уже сделано в EmployerPanel).
2. Файл загружается в нужный bucket (`company-uploads` / `vacancy-uploads` / `training-uploads` / `interview-uploads`).
3. Появляется карточка «Файл загружен: …» + правая кнопка «Распознать документ» (brand-primary).
4. Клик → `ai-ingest-document` (signed URL + ProTalk). Файл после успеха удаляется (как уже работает).
5. Распознанный текст показывается в редактируемом `<Textarea>` со счётчиком `N / maxChars`.
6. **Кнопка «Оформить красиво с помощью ИИ» рендерится по центру отдельной строкой под textarea** (а не в углу). Включается по правилу: суммарно ≥50 символов и `aiReady` (рестарт прошёл).

### 2. Окно ожидания с маскотами

Сейчас `AIWaitProvider` поднимает overlay только для `aiWaitRun`. Нужно:
- Все три действия компонента (upload → ingest, ingest → текст, distribute/enhance) обёрнуты в `aiWaitRun({ title, entity })`.
- Расширить overlay из `AIWaitProvider`/`LoadingPhrase`, чтобы он показывал картинку маскота (`src/components/Mascot.tsx`) рядом с фразой и `entity`-зависимым текстом из `loadingPhrases.ts`. Если оверлей уже это делает — просто пробрасываем `entity` повсюду из `DocumentUploader`.

### 3. Переключение вакансий на новый компонент

В `src/pages/EmployerPanel.tsx`:
- Удалить inline-блок «шаг 1/2/3» (upload + Распознать + textarea + Оформить красиво) из мастера вакансий (~стр. 2860–2960) и из модалки редактирования вакансии (если есть аналог).
- Поставить `<DocumentUploader entity="vacancy" entityId={draftVacancyId} value={vacancyRawText} onChange={setVacancyRawText} enhanceMode="external" onEnhanceClick={runVacancyEnhanceAll} maxChars={5000} />`.
- `runVacancyEnhanceAll` — существующий обработчик, который собирает все поля + `vacancyRawText` как `file_context` и зовёт `aiEnhanceAll({ mode: "all_vacancy", ... })`.
- Подсказка обновляется: «Шаг 1 — загрузите файл. Шаг 2 — нажмите ‘Распознать документ’. Шаг 3 — нажмите ‘Оформить красиво с помощью ИИ’.»

### 4. Стиль

Компонент уже на `.brand-editor` (синий градиент + золото). Подтверждаем, что в вакансии он рендерится в той же карточке, без белого фона (сейчас вакансия частично на белой карточке — оборачиваем uploader в blue-glass контейнер как в компании).

### 5. Что НЕ трогаем сейчас

- Не переносим uploader в Training / Interview / Resume в этом же шаге — только готовим компонент так, чтобы это сделать одной строкой потом.
- `ai-ingest-document` и `ai-enhance` остаются как есть.

## Проверка

- Загрузить PDF в мастере вакансий → видна карточка «Файл загружен» → клик «Распознать документ» → оверлей с маскотом и фразой → появляется текст в textarea ≤5000 → кнопка «Оформить красиво» по центру активна → клик заполняет 15 полей.
- Стиль идентичен экрану «Создать компанию».
- Старый flow компании не сломан.

## Файлы

- `src/components/DocumentUploader.tsx` — новый (или переименование `DocumentIngestField.tsx`).
- `src/components/DocumentIngestField.tsx` — тонкая обёртка (back-compat) или удаление, если нигде больше не используется в актуальном виде.
- `src/pages/EmployerPanel.tsx` — вырезать inline-блок вакансии, вставить `<DocumentUploader entity="vacancy" …>`; обернуть в blue-glass контейнер.
- `src/components/AIWaitProvider.tsx` / `LoadingPhrase.tsx` — убедиться, что оверлей показывает маскота (минимальная правка, если уже почти есть).
