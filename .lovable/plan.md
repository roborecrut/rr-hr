# Общий план: 24 задачи

Реализация партиями по 3–6 задач за итерацию. После каждой партии — пауза для приёмки. Старт: **Партия 1 (Оверлеи/маскот)**.

## Сквозные решения

- **Реалтайм:** для баланса/лимитов (#5) — Supabase Realtime подписка на `wallets`/`transactions` (мгновенно). Для аналитики вакансий (#9) — гибрид: Realtime на `candidate_scores`/`candidate_stage_progress` + ленивый пересчёт счётчиков на клиенте. Включение публикации делается одной миграцией.
- **Маркдаун (#10, #11, #14):** один общий компонент `<RichMarkdown variant="chat|resume|training" />` на базе текущего `RichTrainingMarkdown`. В чатах — облегчённый вариант (без тяжёлых блоков обучения), в резюме/скрининге — полный. Это уберёт дублирование стилей и обеспечит единый UI.
- **Кэш (#4, #18):** один утилитный модуль `src/lib/cacheReset.ts` с `resetAppCache({ keepEmployer?, keepCandidate? })` — точечно чистит React Query, sessionStorage и проектные ключи localStorage, **сохраняя** ключи профилей (`rr.employer.session`, `rr.candidate.session`).
- **Карточка вакансии (#3):** новый `src/components/VacancyCard.tsx`, используется в `VacancyCatalogPage`, `CompanyLanding`, `JobVacancyLanding` (motivation), `CandidateFlow` (условия). Описание формируется из `vacancy_text` через тот же `summarize`, fallback — `salary_terms + schedule_terms`.

## Партии

### Партия 1 — Оверлеи и маскот (#1, #24)
- `AIWaitProvider.tsx` и `AIRestartGate.tsx`: убрать CSS `aiwait-typing/airg-typing` (мигающий курсор + steps animation), убрать ротацию `phraseIdx` (без смены каждые 2.8с — оставить **одну** фразу на сессию, выбранную случайно), убрать `aiwait-dots`.
- Заменить на плавную «печатающую» анимацию: посимвольный JS-таймер с интервалом **200 мс** (5 cps), без курсора-мигалки. Реализуем хук `useTypewriter(text, cps)`.
- Зафиксировать раскладку: контейнер бабла = `min-h-[88px]`, `max-h-[88px]` (или `min-h` + `overflow-hidden`), маскот всегда в той же позиции — `flex` с фиксированной высотой ряда. Длина фразы больше не двигает робота.
- #24: словарь русских названий полей `FIELD_LABELS_RU` (vacancy/company/training/interview) в `src/lib/fieldLabels.ts`. Везде, где `aiEnhanceSingle({ field })` вызывается с заголовком оверлея, передавать русское имя из словаря.

### Партия 2 — Карточка вакансии и каталог (#3, #13, #2, #17)
- Создать `VacancyCard.tsx` (логотип компании, роль, описание ≤220 симв., зарплата, график, CTA).
- `VacancyCatalogPage`: сетка `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, мобильные отступы `px-[3%]`, `box-border` чтобы карточки не выходили за край.
- Заменить локальные рендеры карточек в `CompanyLanding`, `JobVacancyLanding` (hero убрать дубль «о компании» — #2: оставить блок только в секции «О компании») и в блоке мотивации (#17 — показывать **все активные** вакансии компании, не фильтровать по текущей).
- Проверить, что `vacancy_text` приходит во всех запросах (новые вакансии без описания на карточке — вероятно, в выборках `select(...)` не запрошено поле; синхронизировать запросы).

### Партия 3 — Кэш и сессии (#4, #18)
- `src/lib/cacheReset.ts`: чистит `queryClient.clear()`, `sessionStorage.clear()`, и из localStorage все ключи кроме whitelist (`rr.employer.session`, `rr.candidate.session`, бренд-настройки).
- Хуки на маршрутах:
  - Выход из ЛК работодателя → `resetAppCache({ keepEmployer: true })`.
  - Вход на `/` → `resetAppCache({ keepEmployer: true, keepCandidate: true })`.
  - Переход по реф-ссылке `?ref=...` → полный сброс.
  - Вход в ЛК кандидата → `resetAppCache({ keepCandidate: true })`.
  - Выход из ЛК кандидата + переход на лендинг компании → `resetAppCache({})`.
- Добавить `<meta http-equiv="Cache-Control" content="no-store" />` на чувствительных страницах через `useSeo`.

### Партия 4 — Бизнес-баги (#12, #15, #16)
- #12: в `DocumentUploader`/`DocumentIngestField` при `<input type="file" onChange>` всегда брать `files[0]?.name` из текущего события, сбрасывать `inputRef.current.value = ""` перед открытием диалога, не читать кэшированное имя из state без обновления.
- #15: в местах проверки баланса (`candidate-start-interview` и т.п.) перед `throw "No credits"` проверять `wallets.balance > 0` и `vacancy.is_active`. Если баланс есть — пропускать. Если нет — открывать новый компонент `VacancyPausedDialog` с контактами работодателя (`employers.email`, `telegram`, `phone`).
- #16: пересмотреть расчёт прогресса в `CandidateFlow` — текущий этап брать из `candidate_stage_progress` по `(candidate_id, vacancy_id)`, а не из глобального state. Добавить хелпер `getCandidateProgress(candidateId, vacancyId)`.

### Партия 5 — Реалтайм и админка балансов (#5, #9)
- Realtime подписка на `wallets` и `transactions` в `AdminPanel` (раздел работодателей и счетов). Цена в карточке обновляется по событию `UPDATE`.
- Миграция: `ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets, public.transactions, public.candidate_scores, public.candidate_stage_progress;` + `REPLICA IDENTITY FULL`.
- #9: в админке раздела «Вакансии» — карточка аналитики по каждой вакансии (счётчики screening/checklist/situations/обучений/регистраций/ср.балл) с подпиской на `candidate_scores` + `candidate_stage_progress`.

### Партия 6 — Админ UI русификация и поиск (#6, #8, #20, #21)
- Везде в `AdminPanel` (клиенты, кандидаты, компании, вакансии, интервью, обучение): заголовки карточек = ФИО / email (gmail) / название компании, а не id. Универсальный `<EntityCard>` с поиском по этим полям.
- #8: в таблице «Последние транзакции» добавить колонки email и имя из `employers`/`profiles` + поиск.
- #20: в карточке клиента — вкладки «Транзакции» (история списаний по вакансиям + что куплено) и «Компании/Вакансии» (привязки).
- #21: клики по названию компании/вакансии = навигация к карточке соответствующей сущности; обратно из карточки компании/вакансии — на карточку клиента (используем `react-router` + query-param модалок).

### Партия 7 — Пошаговый онбординг работодателя (#7)
- В `EmployerPanel` ввести состояние `setupStep` (computed from БД: companyExists → vacancyExists → trainingExists → interviewExists).
- Кнопки разделов «Вакансия», «Обучение», «Интервью» получают `disabled` + тултип «Сначала создайте … ».
- Бейдж текущего шага в шапке кабинета.

### Партия 8 — Маркдаун (#10, #11, #14)
- Вынести `RichTrainingMarkdown` → `<RichMarkdown variant="training|chat|resume" />`.
- Подключить в:
  - Карточка кандидата → «Распознанный текст резюме».
  - `EmployerAIAssistant`, `VacancyAIAssistant`, AI-чат на главном лендинге — рендер `message.parts` через `<RichMarkdown variant="chat" />` внутри бабла.
  - Демо-скрининг и ЛК кандидата → окно распознанного текста (показывать целиком, без обрезки; кнопка «Свернуть»).

### Партия 9 — Хеддер, ЛК кандидата, мелочи (#22, #23, #19)
- #23: в `SiteHeader.tsx` иконки навигации показываются всегда (не скрываются на md), а текст скрывается на md.
- #22: в карточке кандидата (админ + СРМ работодателя) этапы обучения — раскрыть на всю ширину карточки (`w-full`, убрать `max-w-...` контейнер).
- #19: в системных промптах `ai-enhance`, `ai-generate-onboarding`, `ai-generate-interview-*` добавить инструкцию «Используй русский язык, избегай англицизмов кроме общеупотребимых терминов и тех, что явно указал пользователь».

## Технические детали

```text
Новые файлы:
  src/components/VacancyCard.tsx
  src/components/VacancyPausedDialog.tsx
  src/components/RichMarkdown.tsx           (рефактор RichTrainingMarkdown)
  src/components/admin/EntityCard.tsx
  src/hooks/useTypewriter.ts
  src/hooks/useEmployerSetupStep.ts
  src/hooks/useRealtimeWallet.ts
  src/lib/cacheReset.ts
  src/lib/fieldLabels.ts

Миграции:
  - ALTER PUBLICATION supabase_realtime ADD TABLE ... (wallets, transactions,
    candidate_scores, candidate_stage_progress) + REPLICA IDENTITY FULL
```

## Что вне плана
- Не трогаем дизайн-токены и бренд-палитру.
- Не меняем структуру таблиц БД (только публикация Realtime).
- Не переписываем edge-функции целиком — точечные правки промптов (#19) и проверки баланса (#15).

После утверждения плана начинаю с **Партии 1 (Оверлеи и маскот)**.
