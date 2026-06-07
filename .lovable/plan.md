
## Что строим

1. **БД** — новые таблицы под посты, комментарии, реакции (на пост и комментарий).
2. **Маршруты** `/blog` (лента) и `/blog/post{public_id}` (страница статьи).
3. **Хедер лендинга** — пункт «Блог» рядом с «Вакансии» (десктоп + мобайл).
4. **Админ-раздел** `Блог` в `/admin` — список постов + редактор (фото + markdown).
5. **Редактор** — клон UX из `TrainingWizard`: тулбар (H1/H2, жирный/курсив/код, списки, ссылка, YouTube/VK/Rutube/Google Docs), переключатель «Редактор / Превью», превью использует `RichTrainingMarkdown` / `RichTrainingMaterialCard` — те же стили, что в личном кабинете кандидата.
6. **Загрузка обложки** — в бакет `posts` (он уже создан).
7. **2 демо-статьи** загрузить через insert.

## Структура БД (миграция)

```text
posts
  id uuid pk
  public_id text unique  -- формат "7" + порядковый: 700001, 700002, …
  title text
  slug text             -- = public_id (для url /blog/post{public_id})
  cover_url text        -- ссылка из bucket posts
  content_md text       -- markdown без лимита
  excerpt text          -- авто (первые 100 символов чистого текста)
  author_id uuid (auth.users)
  is_published bool default true
  created_at, updated_at timestamptz
```
- `seq_post_pid` старт с 700001, триггер заполняет `public_id` и `slug`.
- Триггер `posts_set_excerpt`: чистит markdown (убирает `#`, `**`, ссылки, картинки, код-блоки) → берёт 100 символов.

```text
post_comments
  id uuid pk
  post_id uuid → posts
  parent_id uuid → post_comments (nullable, для ответов 1 уровня)
  user_id uuid (auth.users)
  body text (<= 2000)
  created_at, updated_at

post_reactions      -- на пост или на коммент (взаимоисключающе)
  id uuid pk
  post_id uuid (nullable)
  comment_id uuid (nullable)
  user_id uuid
  kind text  -- 'like' | 'fire' | 'heart' | 'clap' | 'wow'
  unique(user_id, post_id, comment_id, kind)
  check (post_id is not null xor comment_id is not null)
```

**GRANT/RLS**
- `posts`: `GRANT SELECT TO anon, authenticated`; админу — всё через service_role и политику `has_role(auth.uid(),'admin')`. Публичное чтение `is_published = true`.
- `post_comments`: select для anon+authenticated (всем видны), insert/update/delete только своему (`auth.uid() = user_id`), админ всё.
- `post_reactions`: select всем, insert/delete только своим.

## Файлы

- `supabase/migrations/<ts>_blog.sql` — таблицы, sequence, триггеры, RLS, GRANT.
- `src/pages/BlogListPage.tsx` — `/blog`. Карточки: обложка (16:9), заголовок, excerpt (100 симв.). Клик → `/blog/post{public_id}`. Брендовый фон + RR-маскот на пустом состоянии.
- `src/pages/BlogPostPage.tsx` — `/blog/post:pid`. Хедер с обложкой, заголовок, контент через `RichTrainingMaterialCard`, блок реакций под постом, блок комментариев.
- `src/components/MarkdownEditor.tsx` — выделим переиспользуемый редактор (тулбар + textarea + переключатель Превью). На основе кода из `TrainingWizard.tsx` строк 169–222 и 557–599. Будет использоваться в редакторе постов; в `TrainingWizard` пока не трогаем, чтобы не рисковать регрессией.
- `src/components/admin/BlogAdmin.tsx` — список постов в админке + кнопка «Новая статья», модал/инлайн-форма: upload обложки в bucket `posts`, поле title, `MarkdownEditor`, чекбокс «Опубликовано», сохранить/удалить.
- `src/components/PostComments.tsx` — список + форма ответа (для auth), кнопки «Ответить», лайки/реакции (5 эмодзи), счётчики, скрытие формы для гостей с CTA «Войдите, чтобы комментировать».
- `src/components/PostReactions.tsx` — переиспользуемые реакции (для поста и для комментария).
- `src/lib/mdExcerpt.ts` — js-хелпер: чистит markdown в плоский текст для превью карточки.
- `src/App.tsx` — добавить `<Route path="/blog" ... />` и `<Route path="/blog/post:pid" ... />`.
- `src/pages/LandingPage.tsx` — добавить кнопку «Блог» в десктоп- и мобайл-навигацию (рядом с «Вакансии»).
- `src/pages/AdminPanel.tsx` — добавить секцию `blog` в `SECTIONS`, рендерить `BlogAdmin`.

## Загрузка обложки

В `BlogAdmin` — `supabase.storage.from('posts').upload(...)` с именем `${crypto.randomUUID()}.${ext}`, затем `getPublicUrl` → пишем в `posts.cover_url`. (Бакет уже создан пользователем; если он private — попрошу включить public; статьи публичные.)

## Демо-статьи (через `supabase--insert`)

После применения миграции вставлю два поста:
1. «Как ИИ-интервью заменяет первичный скрининг HR» (≈3–4 экрана markdown с H1/H2, списками, цитатами).
2. «5 шагов, чтобы запустить онбординг в RR за вечер».
Обложки — публичные URL из бакета `posts` (заглушки можно сгенерировать `imagegen` или временно использовать существующие RR-маскоты, если пользователь захочет — уточню при реализации).

## Открытые вопросы (отвечу по умолчанию, если не возразите)

- Реакции: 5 типов (👍 ❤️ 🔥 👏 😮). Лайк = «👍».
- Ответы на комментарии — 1 уровень вложенности (как в большинстве блогов). Ответы на ответы остаются в той же ветке.
- Редактирование/удаление комментария — автор и админ.
- `/blog` доступен всем (без авторизации); комментировать/реагировать — только авторизованным.
