## Цель

1. Очистить «глобальную» навигацию: на всех публичных страницах в подвале оставить только логотип + название, ссылки «Главная / Каталог / Панель Руководителя / Панель Кандидата / Авторизация» убрать.
2. На мобильных футер не показывать вовсе (на дашбордах кабинетов уже свои нижние навбары, на публичных страницах он просто не нужен).
3. В шапке `MainCatalogPage` (`/vacancy`) убрать оставшиеся пункты «Панель Работодателя», «Кабинет Соискателя», «Админ» — оставить логотип/название, переключатель «Главная ↔ Каталог», бургер и одиночную кнопку «Войти / Регистрация».
4. В Telegram OIDC жёстко валидировать `redirect_to`-домен и возвращать кандидата именно на лендинг вакансии, с которой он начал; если у кандидата уже несколько кандидатских записей (несколько вакансий), вести его в общий профиль, где он сам выбирает компанию/вакансию.

---

## Часть A. Зачистка футеров и шапки

### A1. `src/pages/LandingPage.tsx`
- Удалить весь блок ссылок «Главная / Каталог должностей / Панель Руководителя / Панель Кандидата / Авторизация» (строки 800–806).
- Оставить только колонку с лого + копирайтом.
- Обернуть `<footer>` в `hidden md:block`, чтобы на мобильных не рендерился.
- Проверить, что `AuthModal` всё равно открывается из других CTA на странице (есть в hero/в шапке).

### A2. `src/pages/MainCatalogPage.tsx`
**Шапка (строки 92–149, 152–220):**
- Из десктоп-нав-бара (`<nav className="hidden md:flex …">`) удалить кнопки `nav_employer`, `nav_candidate`, `nav_admin`. Оставить только `nav_landing` («Главная») и `nav_catalog` («Каталог Профессий»).
- Кнопку «Войти / Регистрация» оставить.
- Из мобильного выпадающего меню (`mobile_nav_employer`, `mobile_nav_candidate`, `mobile_nav_admin`) — удалить те же три пункта. Оставить «Главная», «Каталог Профессий», «Войти / Регистрация».

**Футер (строки 416–436):**
- Удалить ряд ссылок «Главная / Каталог / Панель Руководителя / Панель Кандидата».
- Оставить только лого + копирайт.
- Обернуть `<footer>` в `hidden md:block`.

### A3. `src/pages/JobVacancyLanding.tsx`
- Подвал уже минимальный (`© Год Робот Рекрутер RR`). Только обернуть в `hidden md:block`.

### A4. `src/pages/CompanyLanding.tsx`
- Подвал уже минимальный (`© Год Имя компании …`). Только обернуть в `hidden md:block`.

### A5. Проверить остальные публичные страницы на скрытую дубль-навигацию
Поиск шаблонов:
- `rg -n "footer|<footer" src/pages src/components` — пройтись по найденному, привести к виду «лого + ©» и `hidden md:block`.
- `rg -n "Панель Руководителя|Панель Кандидата|Панель Работодателя|Кабинет Соискателя|Каталог должностей|Каталог Профессий" src` — отлавить остаточные ссылки в любых компонентах и удалить (кроме легитимных мест: внутри AuthModal, EmployerPanel-табы и т.п.).
- `rg -n "navigate\(\"/employer\"|navigate\(\"/candidate\"|navigate\(\"/admin\"" src/pages src/components` — убедиться, что таких внешних кнопок не осталось в шапках/футерах публичных страниц.

Кабинеты (`EmployerPanel`, `CandidateFlow`, `AdminPanel`) — НЕ трогаем: там собственные шапки/табы.

---

## Часть B. Жёсткий whitelist редиректов + правильный возврат кандидата

### B1. `supabase/functions/telegram-oidc-start/index.ts`
- Принимать `redirect_to` как полный URL лендинга (например, `https://hr-rr.online/acme/sales-manager`).
- Хелпер `safeRedirectTo(input: string): string` — валидирует:
  - URL парсится,
  - `protocol === 'https:'`,
  - `host` входит в whitelist: `hr-rr.online`, `www.hr-rr.online`, `hr-rr.ru`, `www.hr-rr.ru`, `hr-rr.lovable.app`, и любой `*.lovable.app` / `*.lovableproject.com` (для превью).
- При невалидном/пустом — fallback `https://hr-rr.online`.
- Сохранять валидированную строку в `oauth_states.redirect_to` (как сейчас, но прошедшую через хелпер).

### B2. `supabase/functions/telegram-oidc-callback/index.ts`
- Аналогичный `safeRedirectTo` применять при чтении `st.redirect_to` (защита, если запись была старая или подделанная).
- Логика возврата:
  - Считать `nextPath` = path+search из `redirect_to` (если есть). Это лендинг, с которого юзер пришёл (`/<companySlug>/<projectSlug>` или `/`).
  - В hash к `/auth/telegram/done` добавить `next=<encodeURIComponent(nextPath)>`.
- Поведение для кандидата с несколькими записями решает фронт (см. B3).

### B3. `src/pages/AuthTelegramDone.tsx`
После `verifyOtp` + `getUser`:
1. Прочитать `next` из hash.
2. Для **employer** — как раньше: `resolveProfilePathForUser(user.id)` → `/employerXXX/profile`.
3. Для **candidate**:
   - Считаем количество строк в `candidates` для текущего `user_id` (`select id, project_id`).
   - Если `count >= 2` → `navigate('/candidate' + public_id + '/profile')` (общий профиль, где он выбирает компанию/вакансию). `public_id` берём из первой строки или из `resolveCandidateByUser`.
   - Если `count === 1` И `next` принадлежит whitelisted-домену И начинается со слэша → `navigate(next)` (возвращаем на лендинг вакансии, чтобы он продолжил флоу терминов/интервью на той же странице).
   - Если `count === 0` И `next` есть → `navigate(next)` (пусть лендинг сам создаст candidate-запись через стандартный путь).
   - Fallback: `resolveProfilePathForUser(user.id)`.
4. Если в `next` пришёл абсолютный URL — игнорировать его и оставить только pathname+search (защита от open-redirect на стороне фронта).

### B4. `src/components/AuthModal.tsx`
- Передавать в `telegram-oidc-start` полный текущий URL как `redirect_to`:
  `redirect_to: window.location.origin + window.location.pathname + window.location.search`.
  Этого достаточно: на главной получим `https://hr-rr.online/`, на вакансии — `https://hr-rr.online/<company>/<project>?ref=…`.

### B5. Тест-сценарий после деплоя
1. `/<company>/<project>?ref=empXXX` → AuthModal → Telegram → возврат на тот же URL вакансии (одна вакансия в `candidates`).
2. Существующий кандидат с 2+ вакансиями логинится через TG из любой вакансии → попадает в `/candidate<public_id>/profile`, где список компаний/вакансий.
3. Запрос на edge с `redirect_to=https://evil.com` → callback редиректит на `https://hr-rr.online`, magic-link не утёк.

---

## Технические детали

- Файлы под изменение:
  - `src/pages/LandingPage.tsx` (футер).
  - `src/pages/MainCatalogPage.tsx` (хедер + футер).
  - `src/pages/JobVacancyLanding.tsx`, `src/pages/CompanyLanding.tsx` (обёртка `hidden md:block` на футер).
  - `src/components/AuthModal.tsx` (передача `redirect_to`).
  - `src/pages/AuthTelegramDone.tsx` (маршрутизация по `next` + count кандидатов).
  - `supabase/functions/telegram-oidc-start/index.ts` (whitelist).
  - `supabase/functions/telegram-oidc-callback/index.ts` (whitelist + `next` в hash).

- Не трогаем: панели кабинетов (Employer/Candidate/Admin) и их внутренние табы.

- Безопасность: оба слоя (edge + фронт) валидируют домен. На edge — для самого редиректа magic-link. На фронте — чтобы `next` в hash не перенаправил вовне.

После «ок» — переключусь в build mode и пройду пункты A1→A4, потом B1→B4, в конце задеплою обе edge-функции.
