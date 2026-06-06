
# План: интервью, заготовки, профиль кандидата

## 1. Проходные баллы (редактируемые работодателем)

**База:**
- `training_stage_tests.pass_score` — уже есть, остаётся редактируемым в `TrainingWizard` (поле «Проходной балл» рядом с тестом каждого этапа).
- В `projects` добавляется колонка `interview_pass_score INT DEFAULT 75` — это средний балл по 3 этапам интервью (резюме + чек-лист + ситуации).

**UI:** в редакторе интервью (см. п.4) — поле «Проходной средний балл по интервью» (1–100, по умолчанию 75).

## 2. Телефон при регистрации кандидата

**База:**
- В `candidates` добавляется `phone TEXT` (если ещё нет — проверим). 
- RPC `candidate_email_signup` расширяется параметром `_phone TEXT`, валидируется регуляркой `^\+?[0-9 ()\-]{7,20}$`.

**UI:** `CandidateAuthModal` — обязательное поле «Телефон» с маской/валидацией формата (без СМС), сохраняется в `candidates.phone`. Только email/пароль/телефон — никаких других обязательных полей.

## 3. Новое 3-этапное интервью из ЛК кандидата

Старый поток интервью в `CandidateFlow` полностью заменяется новым компонентом `CandidateInterview.tsx` с кнопкой «Начать интервью» во вкладке «Интервью» ЛК.

**Этапы:**
1. **Скрининг резюме (0–100):** кандидат вставляет/загружает текст резюме → отправляется на edge-функцию `ai-interview-screen-resume` с заготовкой «важные параметры» → ИИ возвращает `{score, summary, strengths, gaps}` → сохраняется в `candidate_scores.resume_score` и показывается кандидату.
2. **Чек-лист (0–100):** 20 вопросов из заготовки (10 с 4 вариантами + 10 текстовых). После ответа на все 20 → `ai-interview-grade-checklist` оценивает разом → `candidate_scores.checklist_score`. Показывается итог + общий комментарий.
3. **Ситуации (0–100):** 3 ситуации из заготовки, по каждой ИИ выдаёт условие → кандидат пишет одну реплику-ответ → после 3 ответов → `ai-interview-grade-situations` оценивает → `candidate_scores.situations_score`.

**Итог:** `interview_score = round((resume + checklist + situations) / 3)`. Если ≥ `projects.interview_pass_score` → `candidates.current_stage = 'training'`, иначе показываем результат с возможностью пересдачи (тоже неограниченно, как у обучения).

**Списание `spend_pack(_kind='interview')`** — при старте первого этапа, идемпотентно.

## 4. Редактор заготовок интервью у работодателя

Новый компонент `InterviewWizard.tsx` в редакторе вакансии, рядом с `TrainingWizard`. Три вкладки:

- **Резюме:** редактор текста «Важные параметры для оценки резюме» (markdown) + кнопка «Сгенерировать ИИ» (с учётом вакансии и шаблона должности).
- **Чек-лист:** список из 20 вопросов с inline-редактором: тип (choice/text), варианты, правильный ответ, пояснение. Кнопка «Сгенерировать ИИ» — заполняет все 20 на основе вакансии.
- **Ситуации:** 3 темы (заголовок + краткая вводная для ИИ + критерии оценки). Кнопка «Сгенерировать ИИ».

**Хранение:** новая таблица `interview_blocks (project_id, kind 'resume'|'checklist'|'situations', payload jsonb, updated_at)`.

**Edge-функции:**
- `ai-generate-interview-resume-criteria`
- `ai-generate-interview-checklist` (20 вопросов с правильными ответами в jsonb)
- `ai-generate-interview-situations` (3 ситуации)
- `ai-interview-screen-resume`, `ai-interview-grade-checklist`, `ai-interview-grade-situations` (правильные ответы и критерии передаются вместе с промптом, как сделано для обучения)
- `ai-list-interview-checklist` — sanitized для кандидата (без correct_answer)

## 5. Шаблон интервью для «Менеджер по продажам»

Добавим колонку `job_titles.interview_template JSONB DEFAULT '{}'::jsonb`.

Структура:
```json
{
  "resume_criteria": "markdown...",
  "checklist": [{"type":"choice","question":"...","options":["...","...","...","..."],"correct":"...","explanation":"..."}, ... 20 шт],
  "situations": [{"title":"...","brief":"...","criteria":"..."}, ... 3 шт]
}
```

Через `supabase--insert` пропишу полный шаблон только для «Менеджер по продажам». При открытии `InterviewWizard` если заготовок ещё нет — предлагается «Заполнить из шаблона должности» (если шаблон есть).

RPC `job_title_get_interview_template(_title)` для чтения; `admin_job_title_upsert_interview_template(_title, _patch)` для админки.

## 6. Профиль кандидата

В `CandidateFlow` вкладка «Профиль» переделывается:

**Убираем:** блоки Google/Telegram регистрации.

**Добавляем:**
- Email (read-only), Телефон (редактируемый), Ссылка на резюме (URL).
- Фото профиля — загрузка в новый storage-бакет `candidate-avatars` (приватный, RLS: владелец = `candidate_id` из таблицы), хранится `candidates.avatar_url` (signed url или путь).
- Поля ссылок на соцсети: Telegram, WhatsApp, Instagram, ВКонтакте, MAX, Сетка, GitHub (только URL, без верификации).
- Список «Мои отклики» (компании + вакансии) — берётся из `candidate_sessions.applications` / уже есть в `CandidateSession.applications`.

**База:** в `candidates` добавляются: `phone`, `avatar_url`, `resume_url`, `social_telegram`, `social_whatsapp`, `social_instagram`, `social_vk`, `social_max`, `social_setka`, `social_github`.

RPC `candidate_update_profile(_token uuid, _patch jsonb)` — валидирует токен → сессию → апдейт.

## Технические детали (миграции и файлы)

**Миграция 1 (schema):**
- `ALTER TABLE projects ADD interview_pass_score INT NOT NULL DEFAULT 75;`
- `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone TEXT, avatar_url TEXT, resume_url TEXT, social_* TEXT (7 шт);`
- `ALTER TABLE job_titles ADD interview_template JSONB NOT NULL DEFAULT '{}'::jsonb;`
- `CREATE TABLE interview_blocks(...)` + GRANT + RLS (employer manages, candidate read sanitized via RPC).
- RPC: `candidate_email_signup` (+ phone), `candidate_update_profile`, `job_title_get_interview_template`, `admin_job_title_upsert_interview_template`.

**Миграция 2 (data):** через `supabase--insert` — заполнение `interview_template` для «Менеджер по продажам».

**Storage:** бакет `candidate-avatars` (приватный) + RLS-политики на `storage.objects`.

**Edge-функции (новые):**
```
ai-generate-interview-resume-criteria
ai-generate-interview-checklist
ai-generate-interview-situations
ai-interview-screen-resume
ai-interview-grade-checklist
ai-interview-grade-situations
ai-list-interview-checklist
```

**Frontend (новые/изменённые):**
- `src/components/InterviewWizard.tsx` (новый)
- `src/components/CandidateInterview.tsx` (новый, заменяет старый flow)
- `src/components/CandidateAuthModal.tsx` (+ телефон)
- `src/pages/CandidateFlow.tsx` (новая вкладка интервью, профиль переделан, убраны Google/TG блоки)
- `src/components/VacancyEditor.tsx` или редактор вакансии (вкладка «Интервью» с `InterviewWizard`)
- `src/lib/candidateSession.ts` (+ phone, avatar_url в типе)
- `src/lib/loadingPhrases.ts` (+ фразы для интервью)

## Объём
Большая итерация: ~1 миграция схемы + 1 data-insert + 7 edge-функций + 2 крупных компонента + правки существующих. Реализую последовательно: миграция → edge-функции → редактор работодателя → новое интервью кандидата → профиль кандидата → шаблон должности.
