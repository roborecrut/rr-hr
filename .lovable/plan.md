# План: единая AI-оркестрация (overlay /restart + RR Pro Max + стабильные ID)

Объём большой и затрагивает чувствительные edge-функции. Прошу подтверждение прежде, чем коммитить код.

## 1. Стабильные ProTalk ID (frontend)

Файл: новый `src/lib/protalkSession.ts`.

- `getProtalkChatId(role: "employer"|"candidate", userKey: string)` — формат `100001` / `200001` + хэш userKey, инкремент через `localStorage` ключ `rr.protalk.idmap`.
- Значение живёт пока не очистится localStorage. Не меняется между шагами демо, редакторами и т.д.
- Используется на всех точках входа в AI: VacancyEditor, CompanyEditor, InterviewWizard, TrainingWizard, CandidateInterview (скрининг/чеклист/ситуации/тесты), DemoInterviewPage.
- Передаётся в edge через body как `chat_id` и `social_id`; edge перестаёт сам мутить ID, если поле пришло.

## 2. /restart оверлей на всех точках входа

Использовать существующий `AIRestartGate` + `beginAIRestart/endAIRestart` + `waitForAIReady`.

Добавить вызов `aiRestart()` (расширенный — см. §3) в `useEffect` при монтировании:
- `VacancyEditor` (создание + редактор)
- `CompanySections`/редактор компании
- `InterviewWizard` (создание + редактор)
- `TrainingWizard` (создание + редактор)
- `CandidateInterview` — отдельные оверлеи на вход в скрининг резюме, чеклист, ситуации
- `CandidateStageTraining` — оверлей на вход в тест профессионального/продуктового/системного обучения
- `DemoInterviewPage` — оверлей сразу после выбора должности

Кнопки генерации AI блокируются через `useAIReady()` до завершения /restart (этот gate уже есть).

## 3. Резервный RR Pro Max (готовые секреты: bot id 67370, токен, api key)

Backend:
- Расширить `_shared/protalk.ts`: новая обёртка `callAI({ message, chatId, socialId, useFallback })`. По умолчанию primary; при `safeErrorCode` (timeout/server/empty-after-retry) поднимает `AIPrimaryFailedError` с `request_id`.
- Frontend ловит ошибку → показывает оверлей «Ещё раз с RR Pro Max» (новый компонент `AIFallbackGate`) с пояснением.
- По клику: edge `ai-fallback-rr-pro-max` (уже существует) дополняется тем же payload, что и primary вызов; сначала шлёт `/restart` через `RrProMaxProvider.restart`, затем повторяет исходный prompt автоматически (без второй кнопки), показывает оверлей ожидания.
- При успехе: фоном вызывается `aiRestart()` для primary, чтобы вернуть основную модель.
- При повторной неудаче: оверлей «Не удалось» с кнопкой-ссылкой `https://t.me/+Qr9hu55w7tEwNjZi`, без «повторить».

Frontend изменения:
- Новый `src/lib/aiFallback.ts` — хранит «последний AI-вызов» в памяти (payload + edge fn name + retry callback) и оркестрирует UI.
- Новый компонент `src/components/AIFallbackGate.tsx` (по аналогии с AIRestartGate, но с маскотом Pro Max и состояниями: error / pro-max-restart / pro-max-running / pro-max-error).
- `src/lib/aiClient.ts.invoke()` после получения серверного `safeErrorCode in {timeout, server_error, empty_response, provider_unavailable}` НЕ кидает Error сразу, а регистрирует попытку в `aiFallback` и возвращает специальный reject.

## 4. Игнор пустых приветствий ProTalk

Уже частично сделано в `_shared/protalk.ts` (`allowEmptyReply`). Расширить:
- Один авто-retry с тем же chat_id (есть).
- Если второй ответ всё ещё пустой → `safeErrorCode = "empty_response"` (триггерит §3, оверлей с Pro Max).
- В `ai-demo-grade-situations`, `ai-demo-screen-resume`, `ai-demo-grade-checklist`: убрать «успех при пустом» — если `text` пустой и retry не помог, возвращать 502 с `request_id`, а не нулевую оценку.

## 5. Удалённый файл резюме

Backend `_shared/resume-screen-runner.ts` и `candidate-upload-file`:
- При ошибке загрузки/чтения файла из storage (`404`/`object_not_found`) — возвращать `safeErrorCode = "file_deleted"`.

Frontend `ResumeDropzone`, `CandidateDocsDossier`, корзина файлов:
- На `file_deleted`: НЕ показывать AIFallbackGate. Показывать инлайн-баннер «Файл был удалён — загрузите его заново», удалить запись из UI и из корзины, открыть dropzone.

## 6. Поллинг через get_last_reply (опционально для длинных задач)

Для уже async-функций (`ai-generate-interview-resume-criteria` и т.п.) оставить текущий job-poll механизм. Документ протокола из задания (`send_message_async`+`get_last_reply`) — использовать только если timeout primary превышает 180с. Сейчас не критично.

## 7. Демо: пошаговая сессия

`src/lib/demoSession.ts`:
- Сохранять `protalk_chat_id` + `protalk_social_id` после первого шага.
- Все последующие шаги (`DemoInterviewPage` step → checklist → situations) передают тот же chatId/socialId в edge.

## Тестирование

- `bun run test:run`
- `bunx tsc --noEmit`
- Ручная проверка в Preview по каждому пункту (демо, редакторы, кандидатский флоу).

## Риски / открытые вопросы

1. Подтверждаешь имена секретов? Сейчас в коде `RR_PRO_MAX_BOT_ID`, `RR_PRO_MAX_API_TOKEN`. Хост у Pro Max тот же `api.pro-talk.ru` или `eu1.api.pro-talk.ru` (из твоего примера)?
2. Маскот Pro Max — есть готовая картинка/URL, или взять стандартный RR-логотип с оверлеем «Pro Max»?
3. Объём правок очень большой (≈25 файлов). OK делать одним заходом, или резать на 3 PR-волны: (a) §1+§2 ID+overlay, (b) §3+§4 fallback+пустые, (c) §5 удалённые файлы?