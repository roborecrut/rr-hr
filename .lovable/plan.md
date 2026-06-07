
## Что делаем

Добавляем публичный блок отзывов на главной странице, систему модерации в `/admin`, авто-ответ ИИ ProTalk на основе FAQ, и заполняем 10 тестовых отзывов с ответами.

## 1. База данных (миграция)

Новая таблица `public.reviews`:
- `id uuid pk`
- `first_name text` (1–50)
- `last_name text` (1–50)
- `content text` (1–500)
- `ai_reply text` — авто-ответ ProTalk
- `admin_reply text` — ответ админа (редактируемый)
- `is_published boolean default true` — модерация (админ может скрыть)
- `created_at`, `updated_at`

RLS + GRANTs:
- `anon`/`authenticated` — `SELECT` только где `is_published = true`
- `anon`/`authenticated` — `INSERT` (любой пользователь оставляет отзыв; валидация длины — через CHECK)
- `UPDATE`/`DELETE` — только админ (`has_role(auth.uid(),'admin')`)
- `service_role` — полный доступ (для edge function)
- rate-limit на вставку через существующий `rl_hit` в edge функции

Триггер `set_updated_at`.

## 2. Edge-функция `reviews-submit`

`supabase/functions/reviews-submit/index.ts`:
- Принимает `{ first_name, last_name, content }`, Zod-валидация (длина, trim).
- Rate-limit по IP (`rl_hit`, 5/час).
- Вставляет строку в `reviews` через service_role.
- В фоне (await перед ответом, чтобы записать `ai_reply`):
  - Тянет последние ~30 `faq_items` (`question` + `answer`) как контекст.
  - Зовёт ProTalk через существующий `_shared/protalk.ts` со спец-промтом «Ты — представитель HR-RR, ответь вежливо на отзыв пользователя, опираясь на FAQ ниже…».
  - Сохраняет ответ в `ai_reply`.
- Возвращает созданный отзыв.

## 3. Лендинг — блок «Отзывы»

`src/components/ReviewsSection.tsx` + подключить в `src/pages/LandingPage.tsx`:
- Заголовок «Отзывы» в текущем брендовом стиле (синий градиент, золотые заголовки).
- Сетка карточек: имя + фамилия (без аватарок), текст, дата; под отзывом — `ai_reply` (плашка «Ответ HR-RR ИИ») и/или `admin_reply` (плашка «Ответ администратора»).
- Кнопка «Оставить отзыв» → модалка с полями: Имя, Фамилия, Текст (счётчик 0/500). Zod-валидация. Сабмит → edge function → toast → перезагрузка списка.
- Грузим публикуемые отзывы напрямую из `supabase.from('reviews')` (RLS пропустит).

## 4. Админка — раздел «Отзывы»

Новая вкладка в `src/pages/AdminPanel.tsx` (`ReviewsSection`):
- Таблица: дата, ФИ, текст (line-clamp), `ai_reply` (line-clamp), `admin_reply`, статус (опубликован/скрыт), действия.
- Клик по строке → `DetailsModal` с `table="reviews"` (использует уже существующий механизм inline-редактирования всех полей — админ правит `admin_reply`, переключает `is_published`, редактирует `ai_reply` при необходимости).
- Кнопка «Удалить» (DELETE через supabase + подтверждение).
- Кнопка «Сгенерировать ответ ИИ» в строке — зовёт edge-функцию `reviews-ai-reply` для одного отзыва (та же логика, что и при вставке, но по `id`).

## 5. Edge-функция `reviews-ai-reply`

Для админской кнопки и сидинга:
- Принимает `{ review_id }`, требует JWT с ролью admin.
- Берёт отзыв + FAQ, зовёт ProTalk, обновляет `ai_reply`.

## 6. Сидинг 10 тестовых отзывов

Через `supabase--insert` после миграции:
- 10 строк с реалистичными ФИ и текстами разной тональности.
- Каждый с заранее заготовленным `ai_reply` (имитация ProTalk-ответа) и `admin_reply` (вежливый ответ админа), `is_published=true`.

## Технические детали

- Стиль модалки отзыва и кнопок: `.brand-editor`, `.btn-brand-primary` — по project memory.
- Импорт ProTalk: `supabase/functions/_shared/protalk.ts` (уже есть `callProTalk` + `logToDb`).
- Никаких аватарок (как просил пользователь).
- Лендинг доступен анонимам — никакого auth-гейта на чтение/публикацию.

## Файлы

Новые:
- `supabase/migrations/<ts>_reviews.sql`
- `supabase/functions/reviews-submit/index.ts`
- `supabase/functions/reviews-ai-reply/index.ts`
- `src/components/ReviewsSection.tsx`

Изменяемые:
- `src/pages/LandingPage.tsx` — подключить блок.
- `src/pages/AdminPanel.tsx` — новая вкладка «Отзывы», `RU_LABELS.reviews`.
