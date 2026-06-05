# План

## 1. Лендинг компании `/com{id}` — оформление 2026

Файлы: `src/pages/CompanyLanding.tsx`, новый `src/components/CompanySections.tsx`, новый `src/components/SectionCard.tsx`, новый `src/hooks/useInView.ts`, `tailwind.config.ts`, `src/index.css`.

- Каждое непустое поле компании из БД рендерится отдельной секцией с заголовком из мастера и фиксированным порядком:
  1. О компании — `description_text`
  2. Продукты — `products_text`
  3. Миссия — `mission_text`
  4. О нас — `about_text`
  5. Команда — `team_text`
  6. Выплаты — `payouts_text`
  7. График — `schedule_text`
  8. ИИ-Система — `system_text`
  9. Показатели — `stats` (рендерим только заполненные ключи; если значение объект `{value,label}` — берём `.value`/`.label`, фикс «[object Object]»)
  10. Вакансии — карточки всех опубликованных проектов этой компании
- `SectionCard`: стеклянный фон `bg-[#1D3E5E]/70 backdrop-blur`, золотая внутренняя обводка, мягкая тень, заголовок с gold-gradient, hover-scale.
- Анимации: fade-in/slide-up через `useInView` + Tailwind keyframes (`fade-in`, `slide-up`, `shimmer`, `float`) — добавлю в `tailwind.config.ts`.
- Мобильное: одна колонка, крупные тапы, sticky мини-меню с якорями секций и подсветкой активной. ПК: `lg:grid-cols-2` где уместно (Выплаты+График, Команда+ИИ).
- Hero: стеклянный логотип из `companies.logo_url`, название, индустрия, CTA «Смотреть вакансии» (скролл к секции) и «На главную».
- Карточки вакансий: логотип компании, `role_name`, `salary_terms`, `schedule_terms`, бейдж «Новая»; клик → `/com{slug}/vac{slug}`. Скелетон при загрузке.

## 2. Унификация `/com{id}` и `/com{id}/vac{id}/company`

- Выношу секции в `<CompanySections company={company} vacancies={vacancies} />`.
- В `CompanyLanding.tsx` оба маршрута используют один и тот же `<CompanySections/>`.
- На `/vac{id}/company` сверху добавляю компактный блок «Текущая вакансия» со ссылкой обратно к вакансии; остальной вид компании идентичен `/com{id}`.
- Удаляю legacy-карточку компании (~415–465).

## 3. Клик по логотипу → страница компании

- В шапке `CompanyLanding.tsx` (стр. ~321): `onClick={() => navigate(companySlug ? \`/com${companySlug}\` : "/")}`. То же — в шапке вакансии.

## 4. Кабинет работодателя `/emp{id}/companies` — карточки из БД

Файл: `src/pages/EmployerPanel.tsx`.

Диагностика по БД подтверждена: у employer `100003` действительно 2 компании (`300002` published, `300003` draft), `owner_employer_id` проставлен. То есть схема правильная — отдельная колонка-«employer-id» уже есть (`companies.owner_employer_id` → `employers.id`). Никаких миграций не требуется.

Текущая правка `fetchCompanies()` (Supabase-only, фильтр по `owner_employer_id`) корректна, но на продакшене всё ещё крутится старый бандл (`/api/companies` → `index.html`). План:

- Подтвердить, что вызов идёт правильно: оставить актуальный код, **добавить логирование счётчика** `console.info("companies loaded", data.length, "for emp", employerId)` для верификации после деплоя.
- Добавить **немедленный вызов** `fetchCompanies()` при изменении `employerId` (отдельный `useEffect`), чтобы карточки появлялись сразу, не дожидаясь 4-сек интервала.
- В UI карточек на `/companies`: если `companiesList.length === 0` и идёт загрузка — показывать скелетон; если 0 и загрузка завершена — «Нет компаний, создайте первую».
- Убрать локальное добавление черновика в `companiesList` при «Отмена» (создание возвращает компанию в state даже когда юзер нажал Отмена → отсюда «одна локальная»). Источник истины — только `fetchCompanies()`.
- Json-guard на остальные `fetch("/api/...")` в `EmployerPanel.tsx` (employer, projects, candidates): проверять `content-type` перед `res.json()`, иначе сразу падать на Supabase-fallback. Тихие SyntaxError в проде — основная причина «пустых» вкладок.
- После правок — **обязательно Publish → Update**, иначе `hr-rr.online` продолжит отдавать старый бандл (preview уже работает корректно).

## 5. Технические детали

- Цвета/анимации только через токены в `index.css` + `tailwind.config.ts`, кастомных hex в компонентах нет.
- Никаких изменений схемы БД, RLS и edge-функций.
- Один новый хук `useInView` (IntersectionObserver), два новых презентационных компонента.

```text
CompanyLanding ─┬─ Header (logo→company)
                ├─ Hero
                └─ CompanySections
                     ├─ SectionCard × N (по непустым полям)
                     └─ VacancyGrid
```
