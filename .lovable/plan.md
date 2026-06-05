# План: ИИ-мастер компании (ProTalk) и публикация лендинга

## 1. База данных (миграция)

**Таблица `companies` — новые поля:**
- `status` text default `'draft'` (значения: `draft` = «Создается», `active` = «Активна»)
- `description_text` text — «Описание компании и чем занимается»
- `products_text` text — «Основные продукты»
- (оставляем `mission_text` как «Имидж, миссия и культура»; убираем дублирование в UI)

**Storage bucket** `company-uploads` (private, RLS: владелец `auth.uid()` через путь `{user_id}/...`) — для временных файлов анализа.

**RPC `company_create_draft()`** — создаёт пустую запись со статусом `draft` для текущего работодателя, возвращает `id` и `public_id`. Никаких списаний с баланса.

**RPC `company_finalize(_id uuid)`** — ставит `status='active'`, `is_published=true`, проверяет владельца.

## 2. Edge Functions

### a) `ai-chat` — добавить `user_social_id` с public_id ЛК
Заменить `buildSocialId({ user_id })` так, чтобы при наличии `employer_public_id` он формировался как `from_user_id:{public_id} ...`. Передавать `employer_public_id` в body.

### b) `ai-restart` (новый, либо доп. mode в `ai-chat`)
Шлёт в ProTalk сообщение `/restart` от лица работодателя при нажатии «+ Добавить Компанию» — сбрасывает диалог бота.

### c) `ai-company-analyze` (новый)
Вход: `company_id`, `file_url` (signed URL из storage). Шлёт ProTalk промпт с жёсткой JSON-схемой:
```
{ "name": str≤80, "mission_text": str≤500, "description_text": str≤600,
  "products_text": str≤500, "team_text": str≤500, "payouts_text": str≤300,
  "schedule_text": str≤300, "system_text": str≤500,
  "stats": { "founded_year": int|null, "employees": int|null, "turnover": str|null } }
```
Парсит JSON, возвращает клиенту (клиент сам решает писать в форму). Логирует prompt+response.

### d) `ai-enhance` — уже есть; используем `mode:"all_company"` и `mode:"single"`. Добавить server-side ограничения на длину каждого поля и для числовых полей — минимум символов (год = 4, обороты ≤ 8 цифр). Промпт обновить под новые поля.

### e) `ai-company-cleanup` (новый)
При финализации удаляет все файлы пользователя из bucket `company-uploads/{user_id}/{company_id}/...`.

Все функции логируют в `logs` payload `function_call_params` (что отправили) и `bot_reply` (что получили) — это база для UI-окна диалога.

## 3. Фронтенд — `EmployerPanel.tsx` (вкладка companies)

### Кнопка
Заменить «Регистрация бренда» → **«+ Добавить Компанию»**. Под списком — пометка: «Создание компаний, лендингов и редактирование — бесплатно».

### Поток «Добавить Компанию»
1. `company_create_draft()` → получаем `{ id, public_id }`.
2. Параллельно invoke `ai-restart` (с `employer_public_id`).
3. Открыть модал-редактор (не уходим со страницы /companies).
4. В списке сразу появляется карточка со статусом «Создается».

### Редактор компании (модал/drawer на правой половине)
Слева — форма полей:
- Название, Логотип
- Описание компании и чем занимается *(новое)*
- Основные продукты *(новое)*
- Имидж, миссия и культура
- Команда, Выплаты, График, Система работы
- Статистика (год основания, сотрудники, обороты)

Контролы:
- **Загрузить документ для анализа** → upload в `company-uploads/{user_id}/{company_id}/`, получаем signed URL, вызываем `ai-company-analyze`, заполняем форму ответом.
- **«Оформить красиво с помощью ИИ»** → `ai-enhance mode:all_company` с лимитами.
- На каждом поле — ⚡ иконка → `ai-enhance mode:single` (передаём `company_id` + поле).
- **Сохранить** → upsert `companies`, `company_finalize`, `ai-company-cleanup`.

Лимиты длины применяются на клиенте (`maxLength` + Zod) и дублируются в edge.

### Док-панель «Диалог с ИИ» (не перекрывает редактор)
Резизуемая колонка справа (или нижняя панель, схлопываемая). Показывает поток: `→ запрос` / `← ответ JSON` по каждому AI-вызову текущей сессии редактора. Хранится в локальном state (не БД).

### Карточки компаний
- Бейдж статуса: «Создается» (жёлтый) / «Активна» (зелёный).
- Клик по карточке → тот же редактор (PATCH), все поля редактируемы, AI-иконки работают.
- Если поле пустое — соответствующий блок/раздел/ссылка на лендинге `/com{public_id}` не рендерится (правка `CompanyLanding.tsx`).

### Сохранение → лендинг
После `company_finalize` показать ссылку `https://hr-rr.online/com{public_id}` и кнопку «Открыть». Никаких списаний RR, никаких `spend_fixed('landing',...)` для компаний (это правило только для вакансий).

## 4. Технические детали

- ProTalk JSON-режим: ставим в системный промпт «Верни СТРОГО JSON в формате …», парсим через `tryParseJson`.
- `user_social_id` теперь `from_user_id:{employer_public_id} message_id:{ts}` — правка `buildSocialId`.
- Storage: `supabase--storage_create_bucket` + RLS политика `storage.objects` `bucket_id='company-uploads' AND (storage.foldername(name))[1] = auth.uid()::text`.
- Безопасность: все RPC `SECURITY DEFINER`, проверяют `auth.uid() = employers.user_id`.
- Идемпотентность: `company_create_draft` возвращает существующий draft, если у работодателя уже есть открытый draft (опционально).

## 5. Файлы для правки
- `supabase/migrations/<new>.sql` — поля, RPC, bucket-grant
- `supabase/functions/_shared/protalk.ts` — `buildSocialId`
- `supabase/functions/ai-chat/index.ts` — приём `employer_public_id`
- `supabase/functions/ai-company-analyze/index.ts` — новый
- `supabase/functions/ai-company-cleanup/index.ts` — новый (или встроить в RPC через `http`)
- `supabase/functions/ai-enhance/index.ts` — лимиты, новые поля
- `src/pages/EmployerPanel.tsx` — кнопка, мастер, лог-панель
- `src/pages/CompanyLanding.tsx` — скрытие пустых блоков
- (новый) `src/components/CompanyEditor.tsx` + `src/components/AIDialogPanel.tsx`

## Уточнения
1. Лог-панель ИИ — справа резизуемая колонка или нижний выезжающий drawer?
2. Загрузка документа: только PDF/DOC/DOCX или ещё картинки (OCR)?
3. При нажатии «+ Добавить Компанию», если у работодателя уже есть незавершённый draft — открывать его или каждый раз создавать новый?