## Проблема

В логах два разных типа ошибок от ProTalk:

1. `ai-restart` → ProTalk вернул 200, но в теле текст `[Server Error: 'str' object has no attribute 'get']`. Это ошибка самого ProTalk: команда `/restart` не работает через OpenAI‑совместимый эндпоинт `/v1/chat/completions`, потому что у того нет понятия `chat_id`/`user_social_id` и сбрасывать просто нечего.
2. `ai-enhance:all_company`, `ai-company-analyze`, `ai-generate-onboarding` → `protalk_504 Gateway Time-out`. Длинные system+JSON промпты висят и обрываются openresty. Раньше изредка приходил ответ от персонажа `test_chat_2`, но это был не‑JSON диалог («Привет, я RR…»), а не структурированные данные.

Корень один: мы используем «не тот» API ProTalk. По спецификации, которую задал пользователь в исходном ТЗ (`user_social_id from_user_id:… message_id:…`, `/restart` сбрасывает бота) — нужен классический ProTalk endpoint, где есть `chat_id`, `user_social_id` и память диалога. OpenAI‑совместимый `/v1/chat/completions` для этого не предназначен.

## Решение

Перевести все обращения к ProTalk на нативный API:

```
POST https://ai.pro-talk.ru/api/v1.0/ask/{PRO_TALK_BOT_TOKEN}
Content-Type: application/json
{
  "bot_id": <PRO_TALK_BOT_ID:number>,
  "chat_id": "<строка вида u_{uid}_{bot}, tb{tg}_{bot} или ask{ts}_{rand}>",
  "user_social_id": "from_user_id:<personalCabinetId> message_id:<ts>",
  "message": "<полный текст запроса>"
}
```

Ответ ProTalk: `{ "done": "...текст..." }` (или `error`). Этот эндпоинт:
- помнит контекст по `chat_id`, поэтому `/restart` действительно сбрасывает сессию;
- принимает обычные русские длинные запросы без stream/openresty‑таймаутов так часто;
- использует промпт и базу знаний бота, который пользователь дальше будет «обучать» в кабинете ProTalk.

### Шаги

1. **`supabase/functions/_shared/protalk.ts`** — переписать `callProTalk`:
   - новый сигнатур: `callProTalk({ message, chatId, socialId })` → `{ text, raw }`;
   - POST на `https://ai.pro-talk.ru/api/v1.0/ask/{token}` (token = `PRO_TALK_BOT_TOKEN`);
   - `bot_id` берём из `PRO_TALK_BOT_ID`;
   - таймаут 110 с через `AbortController`, нормальная обработка 4xx/5xx;
   - сохранить `buildChatId` / `buildSocialId` / `logToDb` как есть;
   - `tryParseJson` оставляем — пригодится для enhance/analyze.

2. **`ai-restart/index.ts`** — отправлять одно сообщение `/restart` через новый `callProTalk`, тот же `chat_id`, что и у обычного диалога этого работодателя (`u_{uid}_{bot}`), и `user_social_id` с `employer_public_id`. После успеха возвращать `{ ok:true, reply }`. На фронте при нажатии «+ Добавить Компанию» сначала вызывать `aiRestart(employer_public_id)`.

3. **`ai-chat/index.ts`** — собирать единый `message` из system+context+истории (склейка с маркерами `Система:`, `Контекст:`, `Пользователь:`, `Ассистент:`) и отправлять одним вызовом `callProTalk`. Persona и память остаются на стороне ProTalk‑бота.

4. **`ai-company-analyze/index.ts`** — отправлять `SCHEMA + raw_text|file_url` одним `message`. Перед парсингом — извлекать JSON‑блок (фигурные скобки, чистка markdown/control‑символов), как в нашей stack‑overflow подсказке. Если JSON битый — возвращать `{ ok:false, raw }`, чтобы UI не падал.

5. **`ai-enhance/index.ts`** — то же самое: и `single`, и `all_*` режим шлют единый prompt через `callProTalk`. Для `single` ответ берём как есть и `clampField`; для `all_*` достаём JSON робастно (markdown‑очистка, поиск `{...}`, повторная попытка с заменой trailing‑comma/control chars). Серверные лимиты `LIMITS`/`clampField` оставляем.

6. **`ai-generate-onboarding/index.ts`** и **`ai-evaluate/index.ts`** — обновить вызовы под новый `callProTalk(message, …)` (та же замена, без других изменений).

7. **Логи** — `logToDb` уже пишет `user_message`, `bot_reply`, `channel_id`, `user_social_id`, `bot_id` — сохраняем семантику, чтобы пользователь видел в таблице `logs` ровно те поля, которые он хочет «обучать» (как раньше работало).

8. **Фронт `EmployerPanel.tsx`** — никаких изменений API не нужно, только убедиться, что `aiRestart(employer.public_id)` вызывается при старте мастера «+ Добавить Компанию» и ошибки `ai-restart`/`ai-company-analyze` показываются в `AIDialogPanel` (уже сделано через `pushAILog`).

### Технические детали

- Секреты: `PRO_TALK_BOT_TOKEN` и `PRO_TALK_BOT_ID` уже есть, новых добавлять не надо.
- `PRO_TALK_API_KEY` (Bearer) больше не используется — оставляем секрет, не удаляем.
- Шаблон chat_id остаётся: `u_{uid}_{botId}` для авторизованного пользователя, `tb{tg}_{botId}` для Telegram, иначе `ask{ts}_{rand}`. Это даёт ProTalk непрерывную память для каждого ЛК.
- `user_social_id` обязательно содержит `from_user_id:<employer_public_id>` (как требовал пользователь — id личного кабинета, напр. `100003`), а для Telegram — `from_user_id:<tg_id> Имя (@user) message_id:<ts>`.
- Парсер JSON: убираем ```` ```json ````, ищем первую `{` и последнюю `}`, повторная попытка после `replace(/,\s*[}\]]/, …)` и удаления `[\x00-\x1F\x7F]`.

### Что НЕ меняем

- Структуру таблицы `logs`, RLS, миграции, бакет `company-uploads`, RPC `company_*` — всё это уже корректно.
- UI‑копию страниц и логику мастера компании.
