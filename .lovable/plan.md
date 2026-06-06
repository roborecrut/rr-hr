# План: глобальное окно ожидания ИИ + единые мульт-роботы RR

## 1. Новый глобальный компонент `AIWaitOverlay`

Файл: `src/components/AIWaitOverlay.tsx` + контекст `src/components/AIWaitProvider.tsx`.

API (через React Context):
```ts
const { run } = useAIWait();
await run({
  title: "Создание вакансии",
  task: () => aiRestart(employerPublicId),  // любая Promise-функция
  timeoutMs: 120_000,                       // дефолт 120 сек
  autoCloseOnSuccess: true,                 // п.1 — не блокирует, можно false
});
```

Состояния окна (модалка по центру, затемнённый фон, нельзя закрыть кликом вне):
- **loading** — картинка `RR7.png` (робот с часами), справа speech-bubble с зацикленной анимацией: 10 фраз ("Ожидайте…", "Я думаю…", "Подбираю слова…", "Сверяюсь с базой знаний…", "Минутку…", "Анализирую контекст…", "Формирую ответ…", "Уточняю детали…", "Почти готово…", "Полирую формулировки…") с эффектом печатания + троеточие. Под облаком — "Не закрывайте окно, идёт генерация" и таймер вперёд в секундах.
- **success** — картинка `RR6.png`, в бабле "Готово! Ответ получен", слева от картинки кнопка **Далее** (закрывает окно). Если `autoCloseOnSuccess=true` — закрывается само через ~0.8 сек.
- **error / timeout** — картинка `RR9.png`, в бабле "Я сломался…" + причина, кнопки **Повторить** (перевызывает ту же `task`) и **Отмена**.

Реализация:
- Один портал на всё приложение, монтируется в `App.tsx` (`<AIWaitProvider>` оборачивает Router).
- Таймаут через `Promise.race` с `setTimeout`.
- Бабл — `framer-motion` (уже не подключен — используем CSS keyframes из `tailwind.config.ts`, расширим набором `typing`/`dots`).
- Превью изображения — `<img src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR7.png">` и т.д.

## 2. Удаление `AIDialogPanel` и `pushAILog`

- Убрать монтирование `AIDialogPanel` в `App.tsx` (если есть) и удалить файл.
- Удалить все `pushAILog(...)` из `src/lib/aiClient.ts` и страниц.
- Технический лог больше не показываем нигде.

## 3. Изменение запуска создания вакансии (п.1 — не ждать рестарт)

Сейчас в `EmployerPanel.tsx` создание вакансии вызывает `aiRestart` и ждёт. Меняем на:
- Открываем редактор вакансии **сразу** (оптимистично).
- Параллельно запускаем `run({ task: () => aiRestart(...), autoCloseOnSuccess: true })` — окно ожидания всплывает поверх редактора, но редактор уже видим и интерактивен после закрытия.
- Если рестарт упал → `AIWaitOverlay` сам предложит **Повторить/Отмена**; редактор остаётся открытым.

## 4. Подключение `run(...)` ко всем точкам вызова ИИ

Обернуть в `useAIWait().run(...)`:
- `aiCompanyAnalyze` — клик "Сделать красиво/анализ компании" в редакторе компании (`EmployerPanel.tsx`, `CompanySections`).
- `aiEnhanceSingle` / `aiEnhanceAll` — кнопки AI/«Сделать красиво» в `VacancyEditor`, `CompanySections`, редакторах интервью/чеклиста/обучения.
- `aiRestart` — создание вакансии / ручной рестарт.
- `aiGenerateOnboarding`, `ai-generate-stage-material`, `ai-generate-stage-test`, `ai-generate-training-material`, `ai-generate-training-quiz`, `ai-generate-interview-checklist`, `ai-generate-interview-situations`, `ai-generate-interview-resume-criteria` — генерации в редакторах обучения/интервью/скрининга.
- `ai-check-stage-answers`, `ai-check-text-answer`, `ai-interview-grade-checklist`, `ai-interview-grade-situations`, `ai-interview-screen-resume`, `aiEvaluate` — проверки/оценивание ответов кандидата (`CandidateFlow`, `CandidateInterview`, `CandidateStageTraining`).
- `ai-distribute-text`, `ai-ingest-document` — обработка документов в `DocumentIngestField` и мастере компании.
- `aiChat` — НЕ оборачиваем (стримящийся чат с консультантом).

Каждой точке передаём осмысленный `title` (например "Улучшаю описание роли", "Проверяю ответы", "Генерирую программу обучения").

## 5. Замена всех ссылок `i.ibb.co` на Supabase Storage

Маппинг по смыслу (использовать только эти URL):
```
RR-Logo.png  → шапка/футер лендинга (LandingPage, MainCatalogPage, AdminPanel, CompanyLanding, JobVacancyLanding)
RR2.png      — Mascot "recruitment" (планшет/ручка) — формы и сбор данных
RR3.png      — Mascot "greeting" (рупор) — приветствия, оповещения, тосты
RR4.png      — Mascot "serious" — предупреждения, подтверждения удаления
RR5.png      — Mascot "narrator" — радостные/успешные крупные сцены
RR6.png      — Mascot "chat" / AIWaitOverlay success
RR7.png      — AIWaitOverlay loading
RR8.png      — иконка для блоков тестов и таймера тестирования (CandidateStageTraining, тесты в интервью)
RR9.png      — AIWaitOverlay error, экраны "Вакансия не активна", 404, любые ошибочные состояния
```
Файлы для правки:
- `src/components/Mascot.tsx` — переписать `MASCOT_SRC` целиком на новые URL.
- `src/pages/LandingPage.tsx` (логотип x2), `MainCatalogPage.tsx`, `AdminPanel.tsx`, `CompanyLanding.tsx`, `JobVacancyLanding.tsx`, `CandidateFlow.tsx`, `EmployerPanel.tsx` — заменить любые оставшиеся `i.ibb.co`-ссылки на соответствующий RR-N.png из таблицы.
- На экране "Вакансия закрыта" в `CandidateFlow.tsx` и `CompanyLanding.tsx` дополнительно добавить `RR9.png`.

## 6. Проверка

- `bun run build` зелёный.
- Вручную проверить: создание вакансии (окно ожидания не блокирует), кнопка «AI» в поле вакансии (overlay), кнопка «Сделать красиво» в компании (overlay), таймаут симулировать через искусственный `delay`.

## Технические детали

- AIWaitProvider — `useState<{status, title, error, task, startedAt}>`, плюс `useEffect` с интервалом 1с для таймера, плюс `useEffect` с интервалом 2.5с для смены фразы.
- Анимация печатания — `@keyframes typing` (ширина 0→100%) + `@keyframes blink-caret`, добавить в `tailwind.config.ts` как `animation: { typing: ..., dots: ... }`.
- Точка отмены — `AbortController` пробрасывается в task опционально (большинство наших `supabase.functions.invoke` отмену не поддерживают — тогда просто скрываем оверлей, запрос завершится в фоне; это допустимо).
- Все картинки грузить с `loading="eager"` и `referrerPolicy="no-referrer"`.

Файлы создаются:
- `src/components/AIWaitOverlay.tsx`
- `src/components/AIWaitProvider.tsx` (экспорт `useAIWait`)

Файлы удаляются:
- `src/components/AIDialogPanel.tsx`

Файлы изменяются:
- `src/App.tsx`, `src/lib/aiClient.ts`, `src/components/Mascot.tsx`, `tailwind.config.ts`, плюс перечисленные страницы и редакторы.
