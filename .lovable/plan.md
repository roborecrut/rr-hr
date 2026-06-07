# Обновлённый план: бесплатное демо-интервью на `/demo`

## Главное изменение

Контент для всех 3 этапов уже лежит в БД — `job_titles.interview_template` (jsonb) c ключами `situations`, `checklist`, `resume_criteria` (включая правильные ответы, объяснения, промпты). **Генерировать ничего не нужно** — функция `ai-demo-prepare` отменяется. Демо просто читает шаблон из БД и проводит кандидата по этапам.

## 1. Маршрутизация

`src/App.tsx`:
- удалить роут `/vacancy` и страницу `src/pages/MainCatalogPage.tsx`;
- добавить роут `/demo` → новая страница `src/pages/DemoInterviewPage.tsx`;
- ссылки на `/vacancy` (хедер, мобильное меню, футер, CTA) заменить на `/demo`.

## 2. Источник контента

Прямой `SELECT title, interview_template FROM job_titles WHERE is_basic = true` (через supabase-js, anon-доступ уже есть для каталога). Кэшируем выбранный шаблон в `localStorage` под ключом `demo:tpl:<job_title_id>` чтобы не дёргать БД повторно.

Структура `interview_template`:
```
{
  situations: { items: [{ id, title, brief, prompt? }, ...] },
  checklist:  { questions: [{ id, kind, question, options?, correct, explanation }, ...] },
  resume_criteria: "markdown"
}
```

Чеклист с `kind:"choice"` оцениваем **локально в браузере** (сравнение с `correct` + показ `explanation`) — без ИИ-вызова, мгновенно и бесплатно.

## 3. Edge-функции (только 2, обе stateless, без биллинга и БД)

- `ai-demo-grade-situations` — `{ title, situations, answers }` → `[{ id, feedback, score }]` (через ProTalk, как в боевом флоу, но без `spend_pack`/`ai_runs`-привязки к проекту).
- `ai-demo-screen-resume` — `{ title, vacancy_text, criteria_md, resume_text }` → `{ score, summary, strengths[], gaps[] }`.

Обе — публичные (`verify_jwt = false` в `config.toml`), in-memory rate-limit по IP (30 req/min). Логирование в `ai_logs` оставляем для отладки.

Чеклист — без edge-функции вообще.

## 4. Страница `/demo`

`localStorage` ключ `demo:state`:
```
{ titleId, stage: 'pick'|'situations'|'checklist'|'resume'|'done',
  template, sitAnswers, checkAnswers, resumeText,
  sitResult, checkResult, resumeResult, finalScore }
```

Экраны:
1. **Выбор должности** — сетка карточек шаблонов (поиск-фильтр). Без «своей должности».
2. **Этап 1 — Ситуация** — рендер из `template.situations.items`, ответы текстом, кнопка «Отправить» → `ai-demo-grade-situations`, показ feedback.
3. **Этап 2 — Чеклист** — рендер из `template.checklist.questions`, локальная проверка `correct`, показ `explanation` после ответа на каждый.
4. **Этап 3 — Резюме** — textarea (опц. drag&drop файл позже), отправка → `ai-demo-screen-resume`.
5. **Финал** — общий балл (среднее), сильные/слабые стороны, две CTA:
   - «🚀 Создать свою систему найма» → `/main` (якорь регистрации работодателя);
   - «↻ Пройти ещё раз» → очистка `demo:state`, на шаг 1.

Шаг-индикатор «1 Ситуация → 2 Чеклист → 3 Резюме». Бренд-палитра, `.brand-editor`, золотые заголовки, синий градиент. Маскот `Mascot` со сменой картинки по этапам (см. ниже).

## 5. Главный лендинг — рефакторинг с маскотами

Используем готовые картинки RR (грузим напрямую с Supabase Storage, `loading="lazy"`, `decoding="async"`, фиксированные размеры):

- **Hero** — `RR2.png` (приветливый с планшетом) рядом с заголовком «Попробуй ИИ-интервью бесплатно. Прямо сейчас.». Главный CTA «🎮 Начать демо-интервью» → `/demo`, вторичный «Я работодатель» → раздел регистрации.
- **Блок «Как работает демо»** — 3 карточки:
  - Ситуация — `RR4.png` (серьёзный, скрестил руки);
  - Чеклист — `RR8.png` (со знаком вопроса);
  - Скрининг резюме — `RR7.png` (смотрит на часы).
  Под блоком крупная CTA «Попробовать прямо сейчас» → `/demo`.
- **Блок «Хочешь так же у себя?»** — `RR3.png` (с рупором, "оповещение"), описание системы найма для работодателей + CTA на регистрацию.
- **Социальное доказательство / отзывы** — `RR5.png` или `RR6.png` (радостные) в углу секции.
- **Хедер**: лого `RR-Logo.png` (если ещё не он). Пункт «Каталог Профессий» → «Демо-интервью» → `/demo`.
- **Состояния ошибок** на демо-странице — `RR9.png` (грустный сломанный) в empty/error-states.
- Удалить старые блоки про каталог. Тарифы, FAQ, футер — оставить.

## 6. Технические детали

**Новые файлы:**
- `src/pages/DemoInterviewPage.tsx`
- `src/lib/demoSession.ts` (load/save/clear `localStorage`)
- `src/lib/mascotImages.ts` — экспортируемые URL-константы для RR2–RR9 (один источник правды; URL Supabase Storage).
- `supabase/functions/ai-demo-grade-situations/index.ts`
- `supabase/functions/ai-demo-screen-resume/index.ts`

**Изменения:**
- `src/App.tsx` — роуты.
- `src/pages/LandingPage.tsx` — рефакторинг hero/секций + маскоты.
- Удалить `src/pages/MainCatalogPage.tsx`.
- Глобальная замена ссылок `/vacancy` → `/demo`.
- `supabase/config.toml` — 2 новые функции с `verify_jwt = false`.

**Оптимизация картинок маскота:**
- Все `<img>` с маскотами — `loading="lazy"`, `decoding="async"`, явные `width`/`height` для отсутствия CLS.
- Hero-картинка — `fetchpriority="high"`, `loading="eager"`.
- Размеры в CSS — `max-width` + `object-fit: contain`, чтобы не растягивать.
- Используем напрямую URL Supabase Storage (они уже сжаты PNG).

**Не делаем (как раньше):**
- Привязку демо к учётке/компании/вакансии.
- Запись результатов в БД.
- Свои должности кандидата (только шаблоны `is_basic = true`).
- Загрузку резюме файлом (только textarea для MVP).
- Функцию `ai-demo-prepare` — больше не нужна, шаблоны уже готовы в БД.
