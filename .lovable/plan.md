
## 1. Подтянуть реальные данные Google/Telegram в профиль работодателя

Сейчас в `src/pages/EmployerPanel.tsx` все поля Google (имя, email, фото, ID) и Telegram (имя/фамилия/ник/фото) инициализируются хардкод‑заглушками («Сергей Ковалев», unsplash‑аватарки и т.п.) — их видно и в шапке (`profileName`/`profileEmail`), и в карточках на странице «Профиль». Загрузка из БД сейчас читает только telegram‑поля.

Что сделать:
- Расширить запрос `profiles` до полного набора: `display_name, avatar_url, email, google_email, registered_via, telegram_*`.
- Дочитать данные провайдеров через `supabase.auth.getUser()` (`user.app_metadata.providers`, `user_metadata.full_name/name/avatar_url/picture/sub`).
- Заполнять из реальных данных:
  - `profileName` ← `display_name` или `user_metadata.full_name`.
  - `profileEmail` ← `email` (из auth.user / профиля).
  - Google‑карточка: `googleName/googleEmail/googlePhoto/googleId` ← `user_metadata.full_name / google_email или email / avatar_url или picture / sub`.
  - Telegram‑карточка: остаётся как сейчас, но если telegram‑полей нет — показывать заглушку «не привязан» вместо случайных значений.
- Если провайдер не привязан (нет `google_email` либо нет `telegram_id`), рендерить кнопки быстрой привязки:
  - «Привязать Google» → `supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })` с `sessionStorage.pendingGoogleAuth = { intent: 'employer', return_to: '/employer/profile' }`.
  - «Привязать Telegram» → вызов `telegram-oidc-start` (как в `AuthModal`), `redirect_to` = текущая страница профиля.

В `supabase/functions/auth-google-finalize/index.ts` дополнительно сохранять в `profiles` все Google‑поля при каждом входе (сейчас уже частично делается — добавить `google_email` всегда, не только из триггера, и `display_name`/`avatar_url` обновлять, только если они пустые, чтобы не затирать ручные правки).

## 2. Диагностика ошибки регистрации через Telegram

В `AuthModal.handleTelegram` сейчас уже выводится `errorText`, но пользователь говорит «даже не перенаправило» — значит `telegram-oidc-start` вернул ошибку, а её текст потерялся (либо Turnstile не пройден, либо отказ по белому списку, либо rate‑limit). Плана:

- В `AuthModal` показывать развёрнутую ошибку: статус + поле `error` + `details`/`reason`, и логировать `console.error("[telegram-start]", { status, body })`.
- В `supabase/functions/telegram-oidc-start` добавить:
  - `console.error("[telegram-oidc-start] failed", { stage, reason, intent, host, path, ip_hash })` в каждой ветке ошибок (turnstile, whitelist_reject, state_persist_failed).
  - При `safeRedirect` rejected — возвращать 400 (а не молча генерить URL), чтобы причина была явной; пока есть только запись в `telegram_events`.
- Завести в БД таблицу `client_errors` (минимальная: `id, created_at, source, message, meta jsonb, user_id`) + edge‑функция `log-client-error` (verify_jwt=false, rate‑limited по IP). В `AuthModal`/`AuthCallback`/обёртках Telegram отправлять туда любые catch‑ошибки. Это даст единый «временный журнал ошибок», пока нет полноценного APM, и админская страница `/admin` сможет его читать через RLS `has_role(auth.uid(),'admin')`.
- Добавить в `/admin` (`src/pages/admin/`) простую вкладку «Журнал ошибок» (последние 200 записей из `client_errors` + последние записи `telegram_events` с `kind in ('whitelist_reject','rate_limited','turnstile_fail')`).

После этого попросить вас повторить вход через Telegram — в логах сразу будет видно `reason`.

## 3. Шапка кабинета работодателя

В `EmployerPanel.tsx` (строки ~1364–1402 и мобильное меню) сейчас захардкожены ссылки «Главная / Каталог Профессий / Панель Работодателя / Кабинет Соискателя». Заменить на:

```
Профиль | Компании | Вакансии | Чек-листы | Тесты | CRM | Тариф | События
```

Ссылки навешиваются на уже существующие табы из левого «Пульта Управления» (`profile`, `companies`, `vacancies`, `checklists`, `tests`, `crm`, `billing`, `events`) — каждая кнопка переключает `activeTab` и одновременно делает `navigate(\`/employer${employerId}/<slug>\`)`. Подсветка активного пункта — по `activeTab`.

Технически это не «новые отдельные страницы» в роутере (контент уже рендерится в `EmployerPanel` по `activeTab`), а нормальные deep‑link URL’ы вида `/employer{publicId}/profile`, `/companies`, `/vacancies`, `/checklists`, `/tests`, `/crm`, `/billing`, `/events`. Добавить парсинг этих суффиксов в `SegmentDispatcher`/`RouterContext` (там, где сейчас обрабатывается `/employer{id}/profile`), чтобы при перезагрузке открывалась нужная вкладка. Мобильное меню переписать тем же списком.

## Технические детали

- Файлы под правки:
  - `src/pages/EmployerPanel.tsx` (шапка, моб. меню, инициализация Google/Telegram state, fetch профиля).
  - `src/components/RouterContext.tsx` / `src/components/SegmentDispatcher.tsx` — добавить недостающие employer‑суффиксы.
  - `src/components/AuthModal.tsx` — детализированный вывод ошибок Telegram + клиентский лог.
  - `src/pages/AuthCallback.tsx` — лог ошибок в `client_errors`.
  - `supabase/functions/telegram-oidc-start/index.ts` — `console.error` и 400 на rejected redirect.
  - `supabase/functions/auth-google-finalize/index.ts` — всегда писать `google_email`, безопасный апдейт `display_name/avatar_url`.
  - Новая edge‑функция `supabase/functions/log-client-error/index.ts`.
  - Новая страница `src/pages/admin/ErrorLog.tsx`, ссылка в `AdminPanel`.

- Миграции:
  - `create table public.client_errors (...)` + GRANTы (`select` admin via has_role, `insert` через service role из edge function), RLS «admin can select, no one else».

- Привязка дополнительных провайдеров делается через `supabase.auth.linkIdentity` — это не создаёт нового пользователя, а добавляет identity к текущему; для Telegram используем тот же flow `telegram-oidc-*`, а в `telegram-oidc-callback` уже есть ветка «текущий юзер залогинен → линкуем telegram_id к profiles».

## Что НЕ делаем в этой итерации

- Не выносим EmployerPanel в отдельные файлы‑страницы (большой рефакторинг — отдельной задачей).
- Не добавляем полноценный APM/Sentry — только временный `client_errors` журнал.
