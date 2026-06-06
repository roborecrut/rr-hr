
# План: меню работодателя, CRM-воронка кандидатов, новая админка

Работа большая, разобью на 3 части. В этой итерации делаю каркас всех трёх частей, чтобы было что увидеть. Полировка подстраниц админки — следующими итерациями.

---

## Часть 1. Левое меню работодателя (`EmployerPanel.tsx`)

Новый порядок и группировка:

**Онбординг (1–5):**
1. Профиль
2. Компании
3. Вакансии
4. Обучение
5. Интервью

**Разделитель + дополнительные:**
- CRM & Воронка
- Тариф & Счета
- События & Логи
- (новое, видно только админу) Админ-панель → переход на `/admin`

Изменения:
- Поменять порядок пунктов и нумерацию в десктопном сайдбаре.
- Адаптировать существующее мобильное меню под тот же порядок (бутерброд).
- Добавить в сайдбар проверку роли `admin` (через уже существующий `user_roles` + `has_role`) и условно показать пункт «Админ-панель».

## Часть 2. CRM-воронка работодателя (`/emp{id}/crm`)

**Новые этапы воронки (8 колонок):**
Регистрация → Скрининг → Чеклист → Ситуации → Профессия → Продукт → Система → Сертификат.

**База данных — миграция:**
- Добавить тип `public.crm_stage` (enum c 8 значениями выше).
- Добавить колонку `candidates.crm_stage public.crm_stage NOT NULL DEFAULT 'registration'`.
- Добавить колонку `candidates.crm_stage_manual boolean NOT NULL DEFAULT false` — фиксирует, что работодатель вручную перетащил карточку (после этого авто-движение для неё отключено).
- Функция `public.candidate_recalc_crm_stage(_id uuid)` — пересчитывает `crm_stage` на основе:
  - есть запись в `interviews` со `started_at` → как минимум Скрининг;
  - `candidate_scores.resume_score` not null → Чеклист;
  - `checklist_score` not null → Ситуации;
  - `situations_score` not null → Профессия;
  - `candidate_stage_progress.stage='professional' passed` → Продукт; `product` → Система; `systems` → Сертификат;
  - все блоки обучения пройдены → остаётся Сертификат.
  Если `crm_stage_manual=true` — функция ничего не меняет.
- Триггеры на `candidate_scores`, `candidate_stage_progress`, `interviews` — после INSERT/UPDATE вызывают `candidate_recalc_crm_stage(candidate_id)`.
- RPC `employer_set_candidate_crm_stage(_candidate uuid, _stage crm_stage)` — права: владелец вакансии или admin; ставит `crm_stage` и `crm_stage_manual=true`.

**UI CRM-страницы:**
- Канбан: 8 колонок по `crm_stage`, drag&drop через нативный HTML5 (без новой библиотеки) → вызов RPC.
- Список (table): сортировка/фильтр по этапу, поиск как сейчас.
- Карточка кандидата (модальное окно по клику на карточку/строку):
  - **Профиль:** фото (аватар-инициалы если нет), имя, контакты (email/телефон/телеграм), все ссылки (на анкету `/cand{public_id}`, вакансию, компанию).
  - **Резюме после скрининга:** `candidates.resume_text` + `candidate_scores.resume_score` + краткое summary.
  - **Чеклист:** ответы из `candidate_answers` (тип checklist) + `checklist_score`.
  - **Ситуации:** ответы + `situations_score`. Средний балл = `overall_score`.
  - **Обучение:** список блоков (Профессия/Продукт/Система) с `last_score`, `passed_at`, ответами и feedback из `candidate_stage_progress.last_answers/last_feedback`; список тестов из `candidate_training_progress` с `score` и `quiz_feedback`.
- Существующая страница профиля кандидата (`/cand…/profile`) остаётся — модалка её агрегирует.

## Часть 3. Админка `/admin` — переход на CRM-систему

`AdminPanel.tsx` превращаю в layout с левым сайдбаром и 9 подстраницами. В этой итерации — каркас + минимально рабочие списки/таблицы; глубокая логика подстраниц — отдельными итерациями.

**Подстраницы:**
1. **Клиенты (работодатели)** — канбан (по статусу: новый / активный / платящий / спящий, рассчитывается из транзакций и активности) + таблица. Карточка работодателя со всей инфой.
2. **Кандидаты** — таблица + фильтры, карточка (та же модалка, что в CRM работодателя).
3. **Компании** — таблица + карточка.
4. **Вакансии** — таблица + карточка.
5. **Интервью** — таблица результатов с переходом в детали.
6. **Обучения** — таблица прогресса.
7. **Рассылки** — заглушка-каркас (список черновиков, форма создания — без отправки в этой итерации).
8. **Роли** — список пользователей с ролями `admin`/`manager`/`employer`/`candidate`, переключение через RPC `admin_set_role`.
9. **Счета** — список транзакций со всеми employer-кошельками, форма ручной корректировки баланса (RPC `admin_wallet_adjust(_employer uuid, _delta int, _note text)`).
10. **ИИ** — список edge-функций ai-* и их промптов; в этой итерации просто страница с описанием и ссылками на edge function logs (без редактирования промптов — это требует вынести промпты в БД, отдельная итерация).

Существующий редактор шаблонов должностей перенесу в подраздел «Вакансии → Шаблоны должностей» (чтобы ничего не потерять).

**Доступ:** все подстраницы под проверкой `has_role(uid,'admin')`. Кнопка входа в админку показывается в личном кабинете работодателя, если у пользователя есть роль admin.

---

## Технические детали

**Миграции (одной транзакцией):**
```sql
-- enum + columns
create type public.crm_stage as enum ('registration','screening','checklist','situations','professional','product','systems','certified');
alter table public.candidates
  add column if not exists crm_stage public.crm_stage not null default 'registration',
  add column if not exists crm_stage_manual boolean not null default false;

-- recalc fn + trigger fn + triggers + RPC employer_set_candidate_crm_stage + RPC admin_set_role + RPC admin_wallet_adjust
```

**Файлы:**
- `src/pages/EmployerPanel.tsx` — переупорядочить меню, добавить кнопку «Админ-панель», переписать CRM (этапы, drag&drop, новая модалка кандидата). Учитывая размер файла (4654 строк), CRM-логику вынесу в `src/components/EmployerCRM.tsx` и `src/components/CandidateDetailsModal.tsx`.
- `src/pages/AdminPanel.tsx` — превратить в shell с `Outlet`/табами; подстраницы — `src/pages/admin/Clients.tsx`, `Candidates.tsx`, `Companies.tsx`, `Vacancies.tsx`, `Interviews.tsx`, `Trainings.tsx`, `Mailings.tsx`, `Roles.tsx`, `Accounts.tsx`, `AI.tsx`.
- Маршруты добавить в `src/App.tsx` под `/admin/*`.

**Что НЕ делаю в этой итерации (по согласованию):**
- Реальную отправку рассылок и редактор промптов ИИ — каркас.
- Сложную аналитику по работодателям в админ-канбане — статусы вычисляю по простой эвристике.

После твоего «ок» — перехожу в build.
