## Цель
Заменить Lovable AI Gateway (Gemini) на ProTalk (OpenAI-совместимый `/v1/chat/completions` со стримингом) во всех ИИ-функциях, добавить логирование в таблицу `logs`, и переключить фронтенд с несуществующих `/api/*` эндпоинтов на реальные edge-функции через `supabase.functions.invoke`.

## Бэкенд: edge-функции

### Общий хелпер `supabase/functions/_shared/protalk.ts`
- `callProTalk({messages, stream, model})` — POST на `https://ai.pro-talk.ru/v1/chat/completions` с заголовком `Authorization: Bearer ${PRO_TALK_API_KEY}`, `stream=true` для чатов, `stream=false` для one-shot/JSON ответов. Возвращает либо полный текст, либо `ReadableStream`.
- `buildChatId(userId, telegramId, botId)` — `tb{tg_id}_{bot_id}` если есть `telegram_id`, иначе `u_{auth.uid}_{bot_id}`, иначе `ask{ts}_{rand}`.
- `buildSocialId(userInfo)` — формат из приложенной функции.
- `logChat(supabase, {user_message, bot_reply, bot_id, channel_id, channel_name, user_social_id, server_name, llm, function_call_params, function_error, tokens_*})` — INSERT в `public.logs`.

### Перепись 4 функций
- `ai-chat/index.ts` — стриминг через ProTalk. Возвращает `Response` с потоком SSE/чанки текста (OpenAI-формат). Принимает `{ kind, messages, context, project_id, candidate_id, employer_id, userInfo? }`. Систему берёт из `SYSTEMS[kind]` + `context`. Логирует последний user-message и собранный assistant-ответ в `logs`.
- `ai-enhance/index.ts` — `stream=false`, `response_format` не используется (ProTalk OpenAI-совместим, попросить JSON в system-prompt и распарсить). Режимы `single | all_vacancy | all_company`. Логирует.
- `ai-evaluate/index.ts` — `stream=false`, JSON-ответ. Режимы `resume | checklist | situations | training_block`. Логирует.
- `ai-generate-onboarding/index.ts` — `stream=false`, JSON-ответ. Сохраняет в таблицы `projects`, `project_questions`, `training_blocks`, `training_lessons`, `training_quizzes` как сейчас. Логирует.

### Конфиг
- В `supabase/config.toml` для всех 4 функций — `verify_jwt = false` (чтобы анонимные посетители лендинга могли спрашивать у `vacancy_consultant`), но внутри функций для `kind=employer|candidate` валидировать JWT через `supabase.auth.getUser(authHeader)` и подставлять `user_id` в `chat_id`.
- Удалить `_shared/ai.ts` (Lovable Gateway больше не используется).

### Секреты
- `PRO_TALK_API_KEY` — основной OpenAI-совместимый ключ формата `23456_XXX...`. **Этого ключа нет в текущих secrets** — попрошу через `secrets--add_secret` перед деплоем.
- `PRO_TALK_BOT_ID` (= `66337`) и `PRO_TALK_BOT_TOKEN` (= `kEL1nRZp330QvUrG1KenhRQ2JIynkWLs`) — нужны для формирования `chat_id`/логов. Сейчас тоже отсутствуют в secrets — добавлю.

### Модель
Какую модель указывать в `model:` для ProTalk — возьму из текущей фронт-настройки `ai_status.model` (по умолчанию `gemini-1.5-flash`) либо новый секрет `PROTALK_MODEL` со значением, которое скажет пользователь. На уточнение оставлю значение по умолчанию `"test_chat_2"` из примера и сделаю его переопределяемым через env.

## Фронтенд: замена `/api/*` на `supabase.functions.invoke`

Все вызовы перевожу на реальные функции. Список замен:

| Сейчас | Станет |
|---|---|
| `fetch('/api/enhance-single-field', {body})` | `invoke('ai-enhance', { body: { mode:'single', ... } })` |
| `fetch('/api/enhance-all-fields')` / `/api/enhance-all-vacancy-fields` | `invoke('ai-enhance', { body:{ mode:'all_company'\|'all_vacancy', ... } })` |
| `fetch('/api/parse-company-file')` | `invoke('ai-enhance', { body:{ mode:'all_company', fields, hint:'parse_file' } })` (текст файла кладём в `hint`) |
| `fetch('/api/generate-project-onboarding')` | `invoke('ai-generate-onboarding', { body:{ project_id, role_name, company_name, brief, save:true } })` + `spend_fixed(project, 'interview_setup'/'training_setup')` после успеха |
| `fetch('/api/evaluate-resume')` | `invoke('ai-evaluate', { body:{ mode:'resume', candidate_id, project_id, payload } })` |
| `fetch('/api/evaluate-checklist')` | `invoke('ai-evaluate', { body:{ mode:'checklist', ... } })` |
| `fetch('/api/evaluate-situations')` | `invoke('ai-evaluate', { body:{ mode:'situations', ... } })` |
| `fetch('/api/evaluate-training-block')` | `invoke('ai-evaluate', { body:{ mode:'training_block', ... } })` |
| `fetch('/api/candidate-assist')` | `invoke('ai-chat', { body:{ kind:'candidate', messages, candidate_id, project_id } })` со стримингом |
| `fetch('/api/vacancy-consultant-chat')` | `invoke('ai-chat', { body:{ kind:'vacancy_consultant', messages, context, project_id } })` со стримингом |

Чисто данные (`/api/projects`, `/api/candidates`, `/api/companies`, `/api/employers/:id`, `/api/admin/*`, `/api/telegram-logs`, `/api/ai-status`, `/api/get-questions`, `/api/admin/pay-mock`) — **не трогаем в этом плане**: это отдельная задача по выпиливанию мок-API, и пользователь явно попросил только про ИИ-функции.

Для стриминга `ai-chat` использую прямой `fetch` к `${VITE_SUPABASE_URL}/functions/v1/ai-chat` (как в knowledge `classic-ai-chat`) с заголовком `Authorization: Bearer <publishable_key>`, парсю SSE и обновляю UI чанками.

## База данных
Изменений схемы нет — таблица `logs` уже создана с подходящими колонками (`channel_id`, `bot_id`, `user_message`, `bot_reply`, `llm`, `api_key`, `server_name`, `tokens_*`, `function_error`, `function_call_params`, `created_at`).

## Что НЕ делаю в этом плане
- Не переписываю `/api/projects`, `/api/candidates`, `/api/employers`, `/api/companies` и админ-эндпоинты — это отдельный большой пласт работ.
- Не меняю UI (тексты «ProTalk» в EmployerPanel уже соответствуют новому бэкенду).
- Не трогаю `signup-bootstrap`.

## Открытые вопросы
1. **Значение `model`** для ProTalk OpenAI API — оставлю `test_chat_2` по умолчанию + переменная `PROTALK_MODEL`. Подтвердите название продакшен-бота.
2. Перед стартом запрошу секреты: `PRO_TALK_API_KEY`, `PRO_TALK_BOT_ID`, `PRO_TALK_BOT_TOKEN` (или подтверждение, что значения из `.env.example` можно использовать).
