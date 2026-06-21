## Цель

Закрыть отложенные пункты после §3 (RR Pro Max уже сделан): §1 стабильные ProTalk ID, §2 `/restart`-оверлеи на всех редакторах, §5 UX `file_deleted` для резюме. Без рефакторинга, без правок CRM/канбана/биллинга/тарифов/обучения/кандидатов как фич.

## Порядок волн

Каждая волна — отдельный коммит и отдельная ручная проверка в Preview перед следующей. Внутри волны изменения сцеплены и не делятся.

### Wave A — §2 `/restart`-оверлеи (UI-only, наименьший риск)

Бекенд `ai-restart` уже есть и шлёт `/restart` в ProTalk. Сейчас оверлей `AIRestartGate` дергается из `App.tsx` (глобально), `EmployerPanel.tsx`, `JobVacancyLanding.tsx`, `DemoInterviewPage.tsx`. Расширяем точки запуска ровно по списку пользователя:

1. Демо-интервью — сразу после выбора должности (уже почти есть в `DemoInterviewPage`, добиваем гарантированный wait-overlay до первого AI-вызова).
2. Вход в **редактор вакансии** и **создание вакансии** — `VacancyEditor.tsx` mount.
3. Вход в **редактор компании** и **создание компании** — `CompanySections.tsx` / `VacancySections.tsx` (точку определить по реальному маршруту работодателя).
4. Вход в **редактор системы интервью** и **создание интервью** — `InterviewWizard.tsx` / `InterviewList.tsx`.
5. Создание кандидата работодателем — точка входа в форму создания.

Правила:
- Один общий хук `useAIRestartOnMount(employerPublicId, scope)` с дедупом по `scope+employerId` в `sessionStorage` (TTL 10 минут): не дёргать `/restart` повторно при перерисовке/переходе между вкладками внутри той же сущности.
- Оверлей блокирует UI до ответа ProTalk (успех/ошибка/таймаут). При ошибке — кнопка «Продолжить без перезапуска».
- Никаких изменений в edge-функциях кроме `ai-restart` (уже работает).

### Wave B — §5 `file_deleted` UX для резюме

Бекенд резюме-runner уже возвращает терминальные коды; сейчас UI этого не показывает. Изменения только во фронте:

1. `ResumeDropzone.tsx`: при job-статусе `file_deleted` (или `file_missing`) показать баннер «Файл недоступен, загрузите снова», очистить превью, разблокировать дропзону.
2. Корзина/история резюме (компонент находится в `CandidateInterview.tsx`): пометить запись как «файл удалён», убрать кнопки «открыть/повторно прогнать».
3. В `useCandidateAiJob.ts` — мапнуть `file_deleted` → отдельный non-fallback терминал (Pro Max тут не помогает: файла нет). Никаких изменений в edge-функциях.

### Wave C — §1 Стабильные ProTalk ID 100001+/200001+

Самый рискованный пункт. Логика:

- `chat_id`-нумератор: для работодателя `100001+` (по `employers.public_id`), для кандидата `200001+` (по `candidates.public_id` либо устойчивому `cand_session.token` → числовой хэш в той же диапазоне). Никакого `localStorage` источника правды — только сервер, `localStorage` лишь кэширует уже выданный id для скорости.
- Новые хелперы в `_shared/protalk.ts`: `buildStableChatId({ scope: "employer"|"candidate", publicId })` и `buildStableSocialId(...)`. Старые `buildChatId/buildSocialId` остаются как fallback.
- Все 15 точек вызова (`ai-chat`, `ai-enhance`, `ai-evaluate`, `ai-restart`, `ai-company-analyze`, `ai-generate-*`, `ai-interview-*`, `ai-demo-*`, `ai-fallback-rr-pro-max`) переключаются на новые хелперы в одном коммите, чтобы не было половинного состояния.
- Бекенд-контракт тел запросов **не меняется** — только сборка id внутри функций. Это снимает риск «синхронно править ≥15 функций» по форме, остаются только числовые id.
- Тесты: `_shared/protalk_test.ts` для новых хелперов + smoke-вызов `ai-restart` с employer_public_id через `supabase--curl_edge_functions`.

## Чего НЕ делаю

- Не трогаю CRM, канбан, billing, тарифы, обучение, кандидатов-как-фичу.
- Не меняю чек-листы и ситуации.
- Не делаю авто-повтор Pro Max → primary (он уже отклонён в §3 как «transport-only»).
- Не правлю `src/integrations/supabase/types.ts`.
- Никаких миграций БД в этих трёх волнах.

## Definition of Done (на каждую волну отдельно)

- Билд зелёный.
- Я лично прогоняю Playwright по соответствующему сценарию на `localhost:8080` и прикладываю скриншот: оверлей появился, исчез, текст AI сохранился, F5 не сбрасывает.
- Если runtime не прошёл — FAIL с точной причиной, фикс в той же волне, следующую волну не начинаю.

## Подтверждение

Прежде чем начать Wave A, подтвердите:
1. Порядок A → B → C ок? (или сначала C, потом A/B)
2. По §2: список точек входа выше совпадает с вашим? Если есть ещё конкретный экран — добавлю.
3. По §1: подход «id выдаёт сервер из public_id, localStorage только кэш» подходит, или вы хотели именно «localStorage — источник правды» (это слабее по безопасности и я бы не рекомендовал)?

## Статус (одним проходом)

- **§2 /restart-оверлеи**: дедуп вынесен в `aiRestart()` (sessionStorage, TTL 10 минут по `employer_public_id`). Все существующие точки входа (вакансия, компания, интервью, кандидат, demo) уже зовут `aiRestart` — теперь без спама при ре-рендере.
- **§5 file_deleted UX**: `ResumeDropzone` получил `fileMissing`. При терминальных кодах `file_deleted|file_missing|no_resume` (или соответствующем тексте) дропзона рисует красный баннер «Файл резюме был удалён — загрузите снова», сбрасывает старое превью и разблокирует выбор файла. Подключено в `CandidateInterview` и `DemoInterviewPage`.
- **§1 Стабильные ID — закрыто на 100% по edge-функциям**: добавлен общий helper `resolveEmployerPublicId({ projectId, userId })` в `_shared/protalk.ts`. Все 12 оставшихся функций (`ai-enhance`, `ai-evaluate`, `ai-distribute-text`, `ai-generate-onboarding`, `ai-generate-hh-templates`, `ai-generate-interview-{checklist,resume-criteria,situations}`, `ai-generate-stage-{material,test}`, `ai-generate-training-{material,quiz}`) теперь резолвят employer.public_id и передают его в `buildChatId/buildSocialId` — получаем стабильный chat_id 100001+ для работодателя. Если резолв не удался, остаётся прежний fallback-хэш в 300001+ (тоже детерминирован).
