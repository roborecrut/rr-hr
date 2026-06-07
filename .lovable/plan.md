# План работ по кабинету кандидата

## 1. Стабильный URL кандидата после регистрации
- В `CandidateAuthModal` / `signup-bootstrap` / `CandidateFlow` после `candidate_email_signup` вместо `/<empPub>/<projectUUID>/<candidateUUID>/profile` собирать `/com{company.public_id}/vac{project.public_id}/cand{candidate.public_id}/profile`.
- Использовать `public_id` из ответа RPC (он уже возвращает `public_id`, нужно также подтянуть `company.public_id` и `project.public_id` — добавить в RPC `candidate_email_signup`/`candidate_email_login` поля `company_public_id`, `project_public_id`).
- Везде в навигации (`navigate(...)`, ссылки в карточках вакансий и кнопке «Перейти к условиям») перейти на схему `com{X}/vac{Y}/cand{Z}/...`.

## 2. Кликабельная кнопка «Перейти к условиям вакансии»
- В `CandidateFlow`/карточке активной вакансии заменить декоративную кнопку на `<Link to={\`/com${companyPub}/vac${projectPub}/cand${candPub}/terms/vacancy\`}>`.

## 3. Перекомпоновка профиля кандидата
Новый порядок блоков:
1. **Контактные данные** (с кнопкой «Редактировать») + **Степень прохождения** (прогресс по этапам).
2. **Большой блок «Выберите компанию и вакансию»** — переезд из левой колонки в центральную секцию, перенос списка применённых заявок + поиска новых.
3. **Файловое досье кандидата** — резюме + документы:
   - Использовать существующий `DocumentUploader` (с оверлеем маскота, кнопкой «Распознать», `AIRestartGate`).
   - **Бакет**: использовать уже существующий **`candidate-resumes`** (private). Для дополнительных документов кандидата создать новый бакет `candidate-docs` (private) — миграция + RLS на `storage.objects`: владелец = `candidate_id` из метаданных, чтение/запись только для своего кандидата и работодателя-владельца проекта.

## 4. Красивые табы для блоков условий
- В страницах `terms/vacancy|onboarding|team|system` использовать тот же парсер `[Иконка Заголовок] описание | подсказка` из `VacancySections.tsx`.
- Вынести компонент `TabbedChecklistBlock` в `src/components/TabbedChecklistBlock.tsx` и переиспользовать его и на лендинге, и в кабинете (стили: liquid-glass синий градиент, золото для заголовков).

## 5. Ребрендинг ProTalk → RR в UI
- Заменить в **UI-текстах** (кнопки, тосты, плейсхолдеры) все «ProTalk» на «RR» в: `DocumentIngestField.tsx`, `DocumentUploader.tsx`, `AIRestartGate.tsx`, `CandidateInterview.tsx`, `aiReady.ts` (текст загрузки), `EmployerPanel.tsx`.
- Внутренние имена файлов/каналов логов (`protalk.ts`, `channel_name: "ai-..."`, `server_name`) — **не трогаем** (это серверные идентификаторы).

## 6. Богатая оценка чеклиста
- В `ai-interview-grade-checklist`: для всех вопросов (включая `choice`) передавать в RR полный набор `question`, `expected/correct`, `candidate_answer` и просить JSON:
  ```json
  {"items":[{"id","score","max","verdict":"correct|partial|wrong","explanation","what_was_right","what_was_wrong"}],
   "total":0..100,"summary":"...","strengths":[],"gaps":[]}
  ```
- Сохранять полный объект в `candidate_scores.checklist_feedback jsonb` (новая колонка).
- В кабинете кандидата на странице результатов чеклиста отрисовать карточки по каждому вопросу + итоговые «Плюсы/Минусы» в Liquid-Glass.

## 7. Сохранение всех результатов интервью
- Сейчас `resume_score` сохраняется, а `checklist_score`/`situations_score` после ребилда страницы пропадают, т.к. читаются из локального стейта `CandidateInterview`.
- Перечитывать `candidate_scores` (resume_score, resume_feedback, checklist_score, checklist_feedback, situations_score, situations_feedback) при mount страницы интервью.
- Гарантировать что edge-функции `ai-interview-grade-checklist` и `ai-interview-grade-situations` всегда делают upsert по `candidate_id` (а не update по `id`, который может быть NULL).

## 8. Реальные оценки на странице `/scoring`
- В `CandidateFlow`/`CandidateScoring` убрать заглушки и читать `candidate_scores` по `candidate_id`. Если строки нет — показывать «нет данных», а не моки.
- Те же поля видны в CRM работодателя (`EmployerPanel`) — они уже подтягивают `candidate_scores`, после фикса п.7 данные совпадут.

## 9. Этапность интервью (resume → checklist → situations)
- В `CandidateInterview` (и роутинге) перед рендером checklist проверять `resume_score != null`, перед situations — `checklist_score != null`. Иначе показывать `<StageLockedNotice/>` с кнопкой «Перейти к предыдущему этапу».

## 10. Списание баланса работодателя за интервью
- Точка списания — нажатие «Оценить резюме» (`ai-interview-screen-resume`).
- В начале функции вызывать `spend_pack(candidate_id, 'interview')` (RPC уже идемпотентен по ключу `pack:interview:{candidate_id}`), значит повторное прохождение для **того же кандидата+вакансии** = бесплатно. Для другой вакансии — другой `candidate_id` → новое списание.
- При недостатке кредитов — возвращать `{error:'no_credits'}` и фронт показывает баннер п.11.

## 11. «Вакансия на паузе» при нулевом балансе
- На входе на страницу интервью вызывать RPC-проверку `can_start_interview(candidate_id)` (новая security-definer функция: проверяет наличие уже списанной транзакции `pack:interview:{cand}` ИЛИ положительный баланс/кредиты работодателя).
- Если нельзя — рендерить `<VacancyPausedNotice/>` с кликабельными контактами работодателя (телефон `tel:`, telegram `https://t.me/...`, email `mailto:`).

## 12. Кликабельные контакты владельца вакансии
- В блоке «Контакты владельца» кабинета кандидата обернуть значения в `<a href="tel:...">`, `<a href="mailto:...">`, `<a href="https://t.me/{handle}">` (нормализовать @handle).

---

## Технические детали

### Миграции
1. Колонки `candidate_scores`:
   - `resume_feedback jsonb`, `checklist_feedback jsonb`, `situations_feedback jsonb` (если нет).
2. RPC `candidate_email_signup` / `candidate_email_login` — добавить в возвращаемый JSON `company_public_id`, `project_public_id`.
3. Бакет `candidate-docs` (private) + RLS на `storage.objects` для `bucket_id='candidate-docs'`.
4. Новая RPC `public.can_start_interview(_candidate uuid) returns jsonb` — для п.11.

### Файлы фронта (правка)
- `src/pages/CandidateFlow.tsx`, `src/components/CandidateAuthModal.tsx`, `src/components/CandidateInterview.tsx`, `src/components/CandidateDetailsModal.tsx`, `src/components/DocumentUploader.tsx`, `src/components/DocumentIngestField.tsx`, `src/components/AIRestartGate.tsx`, `src/lib/aiReady.ts`, `src/pages/EmployerPanel.tsx`.
- Новые: `src/components/TabbedChecklistBlock.tsx`, `src/components/VacancyPausedNotice.tsx`, `src/components/StageLockedNotice.tsx`, `src/components/ChecklistResults.tsx`.

### Edge-функции
- Правки: `ai-interview-screen-resume` (списание), `ai-interview-grade-checklist` (богатый фидбек + сохранение), `ai-interview-grade-situations` (сохранение фидбека).
- Новых функций не требуется.

### Дизайн
Все новые экраны — в текущем brand-стиле (Apple Liquid Glass на градиенте `#17344F → #265582`, золотые заголовки, белый текст), карточки без тёмно-серого/чёрного.
