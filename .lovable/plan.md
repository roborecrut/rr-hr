## Цель
Подключить Google OAuth для:
- **работодателей** (с реферальным кодом `?ref=empXXXXXX`),
- **кандидатов** (вход с индивидуального лендинга вакансии — `/{companySlug}/{projectSlug}` и `candidate{publicId}/...`),
- **админа** (автодоступ в Lovable-редакторе уже работает через `AdminGuard`, добьём ещё авто-выдачу роли admin вашему email при первом входе).

Работаем со всеми доменами:
`hr-rr.online`, `www.hr-rr.online`, `hr-rr.ru`, `www.hr-rr.ru`, `hr-rr.lovable.app` и preview-домен Lovable.

---

## Часть 1. Архитектура (зачем так)

В Supabase **один** Google OAuth-клиент на проект — это нормально. Google ограничение: один `redirect_uri` в самом OAuth-обмене, и это всегда:
```
https://rjhtauzookkvlipvqpvr.supabase.co/auth/v1/callback
```
После этого Supabase редиректит пользователя обратно на ваш домен по адресу, который мы передаём в `options.redirectTo` при вызове `signInWithOAuth`. То есть **разные домены и разные лендинги работают через один OAuth-клиент**, просто `redirectTo` динамический.

Параметры `intent` (employer/candidate), `ref` (реферал) и `project`/`candidate_public_id` (с какого лендинга пришли) Google не пробрасывает в `raw_user_meta_data`. Поэтому используем такой паттерн:

1. Перед `signInWithOAuth` сохраняем в `sessionStorage` объект `{intent, ref, return_to, project_slug, company_slug}`.
2. После возврата на сайт страница `/auth/callback` читает эти данные, вызывает edge-функцию `auth-google-finalize`, которая:
   - проставляет `intent` в `profiles.registered_via`/`user_roles`,
   - создаёт `employers`/`candidates` запись с привязкой к проекту,
   - применяет реферальный бонус через существующий `apply_referral_bonus(...)`,
   - возвращает целевой URL (профиль работодателя или этап кандидата на нужной вакансии).
3. Делаем `navigate(returnTo)`.

Это полностью повторяет логику Telegram-входа, который у вас уже работает.

---

## Часть 2. Что меняем в коде

```text
src/pages/AuthCallback.tsx           NEW — обрабатывает возврат от Google
src/App.tsx                          + Route /auth/callback
src/components/AuthModal.tsx         handleGoogle: сохранять intent/ref/return_to в sessionStorage,
                                      redirectTo всегда = `${origin}/auth/callback`
src/pages/JobVacancyLanding.tsx      кнопка «Войти через Google» сохраняет project_slug/company_slug
src/pages/CompanyLanding.tsx         то же
supabase/functions/auth-google-finalize/index.ts   NEW edge-функция
supabase/migrations/<ts>_admin_bootstrap.sql       триггер: email shishkarnem@gmail.com → role admin
```

`handle_new_user()` уже умеет читать `intent` и выдавать роль admin для `shishkarnem@gmail.com` — этого хватает на первый вход. Финализирующая функция нужна для referral/привязки к вакансии (это нельзя сделать в триггере, т.к. `ref` приходит из браузера).

Для админа: ваш email `shishkarnem@gmail.com` уже захардкожен в `handle_new_user` — при первом Google-входе вы автоматически получаете роль `admin`. Дополнительно `AdminGuard` пускает любого, кто открыл `/admin` внутри Lovable-iframe.

«Войти как работодатель/кандидат» из админки сделаем отдельной кнопкой: ссылка на `/employer{public_id}/profile` и `/candidate{public_id}/profile` любого существующего пользователя (без подмены сессии — просто навигация под вашей admin-сессией; RLS у админа всё разрешает через `has_role`).

---

## Часть 3. Пошаговая инструкция «для чайника»

### Шаг 1. Создать OAuth-клиент в Google Cloud
1. Откройте https://console.cloud.google.com/ и создайте (или выберите) проект, например `hr-rr`.
2. Слева **APIs & Services → OAuth consent screen** (https://console.cloud.google.com/apis/credentials/consent):
   - User Type: **External** → Create.
   - App name: `HR-RR`, support email — ваш.
   - **Authorized domains** добавьте: `hr-rr.ru`, `hr-rr.online`, `lovable.app`, `supabase.co`.
   - Scopes: добавьте `userinfo.email`, `userinfo.profile`, `openid`.
   - Test users: добавьте `shishkarnem@gmail.com` (пока приложение не «Published»).
3. Слева **APIs & Services → Credentials** (https://console.cloud.google.com/apis/credentials):
   - **Create credentials → OAuth client ID**.
   - Application type: **Web application**, имя `HR-RR Web`.
   - **Authorized JavaScript origins** — добавить все:
     ```
     https://hr-rr.ru
     https://www.hr-rr.ru
     https://hr-rr.online
     https://www.hr-rr.online
     https://hr-rr.lovable.app
     https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app
     ```
   - **Authorized redirect URIs** — только один:
     ```
     https://rjhtauzookkvlipvqpvr.supabase.co/auth/v1/callback
     ```
   - Нажмите Create → скопируйте **Client ID** и **Client Secret**.

### Шаг 2. Включить Google-провайдер в Supabase
1. Откройте https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/auth/providers
2. Найдите **Google** → Enable.
3. Вставьте Client ID и Client Secret из Шага 1 → Save.

### Шаг 3. Прописать домены в Auth URL Configuration
1. Откройте https://supabase.com/dashboard/project/rjhtauzookkvlipvqpvr/auth/url-configuration
2. **Site URL**: `https://hr-rr.ru`
3. **Redirect URLs** (по строке на каждый шаблон, со `*` для произвольных путей лендингов):
   ```
   https://hr-rr.ru/**
   https://www.hr-rr.ru/**
   https://hr-rr.online/**
   https://www.hr-rr.online/**
   https://hr-rr.lovable.app/**
   https://id-preview--86998fcc-a4e0-4bf6-8ae7-d8b67afa546d.lovable.app/**
   http://localhost:5173/**
   ```
   Это нужно, чтобы Supabase разрешил `redirectTo` обратно на любой ваш лендинг.

### Шаг 4. Нажать «Implement plan» в чате
После этого я добавлю код из Части 2: `AuthCallback`, обновлю `AuthModal.handleGoogle`, создам edge-функцию `auth-google-finalize` и миграцию-страховку для роли admin.

### Шаг 5. Проверка
- Откройте `https://hr-rr.ru/?ref=empXXXXXX` → AuthModal → «Войти через Google» → вернётесь в кабинет работодателя, увидите +1000 RR + запись о реферере.
- Откройте лендинг вакансии `https://hr-rr.ru/{companySlug}/{projectSlug}` → «Войти как кандидат через Google» → попадёте в `candidate{publicId}/profile` уже привязанным к этой вакансии.
- Откройте `/admin` в редакторе Lovable — войдёте без логина (iframe-fallback). С `hr-rr.ru/admin` под `shishkarnem@gmail.com` — войдёте по роли admin.

---

## Часть 4. Что НЕ требуется
- Не нужно несколько Google OAuth-клиентов — `redirectTo` хватает.
- Не нужно трогать `supabase/config.toml` — провайдеры внешнего Supabase настраиваются только в Dashboard.
- Не нужен отдельный «технический» админ-аккаунт — ваш `shishkarnem@gmail.com` получает роль admin автоматически.
