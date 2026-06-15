# Реестр Edge Functions — A1 аудит

Дата: 2026-06-15. Всего функций: **33** (исключая `_shared`).

## Легенда

- **Caller**: `EMP` = авторизованный работодатель/админ (Supabase Auth JWT), `CAND` = публичный кандидат (token из `candidate_sessions`), `PUBLIC` = свободный публичный доступ, `RKS` = серверный callback Robokassa.
- **JWT**: `verify_jwt` в `supabase/config.toml` (Lovable-платформа рекомендует in-code валидацию вместо gateway-флага).
- **In-code**: добавлена ли проверка в коде функции (`requireEmployerJwt` / `requireCandidateToken` / подпись Robokassa).
- **Ownership**: проверяется ли принадлежность данных (project/company/candidate) пользователю.
- **RL**: rate limit.

| # | Функция | Назначение | Caller | JWT | In-code | Ownership | RL | Исправлено | Осталось |
|--:|---|---|---|---|---|---|---|---|---|
| 1 | ai-chat | AI-чат ассистент (ProTalk) | EMP | false | ✅ `requireEmployerJwt` | через RLS на `assistant_chats` | – | JWT в коде | RL по user_id |
| 2 | ai-check-stage-answers | Оценка ответов кандидата на тест этапа | CAND | false | ✅ `requireCandidateToken` | candidate_id из токена | – | привязка к токену | – |
| 3 | ai-check-text-answer | Оценка текстового ответа | CAND | false | ✅ `requireCandidateToken` | candidate_id из токена | – | привязка к токену | – |
| 4 | ai-company-analyze | Анализ описания компании | EMP | false | ✅ `requireEmployerJwt` | check company.owner_id | – | JWT в коде | – |
| 5 | ai-demo-grade-checklist | Стейтлесс демо | PUBLIC | false | – | – | ⚠️ нет | – | A2: добавить RL |
| 6 | ai-demo-grade-situations | Стейтлесс демо | PUBLIC | false | – | – | ⚠️ нет | – | A2: добавить RL |
| 7 | ai-demo-screen-resume | Стейтлесс демо | PUBLIC | false | – | – | ⚠️ нет | – | A2: добавить RL |
| 8 | ai-distribute-text | Раскладка текста в поля вакансии | EMP | false | ✅ `requireEmployerJwt` | – | – | JWT в коде | – |
| 9 | ai-enhance | Улучшение полей вакансии/компании | EMP | false | ✅ `requireEmployerJwt` | – | – | JWT в коде | – |
| 10 | ai-evaluate | Унифицированная оценка | EMP | false | ✅ `requireEmployerJwt` | candidate.employer_id | – | JWT в коде | – |
| 11 | ai-faq-assist | FAQ-ассистент | EMP | false | ✅ `requireEmployerJwt` | – | – | JWT в коде | – |
| 12 | ai-generate-interview-checklist | Генерация чек-листа интервью | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 13 | ai-generate-interview-resume-criteria | Генерация критериев резюме | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 14 | ai-generate-interview-situations | Генерация ситуаций | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 15 | ai-generate-onboarding | Генерация онбординга | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 16 | ai-generate-stage-material | Генерация материала этапа | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 17 | ai-generate-stage-test | Генерация теста этапа | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 18 | ai-generate-training-material | Генерация материала обучения | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 19 | ai-generate-training-quiz | Генерация квиза обучения | EMP | false | ✅ `requireEmployerJwt` | project.employer_id | – | JWT в коде | – |
| 20 | ai-ingest-document | Извлечение текста из файла | EMP+CAND | false | ✅ dual: JWT либо CAND-token | по entity | – | dual-auth | – |
| 21 | ai-interview-grade-checklist | Оценка чек-листа кандидата | CAND | false | ✅ `requireCandidateToken` | candidate_id из токена | – | привязка к токену | – |
| 22 | ai-interview-grade-situations | Оценка ситуаций кандидата | CAND | false | ✅ `requireCandidateToken` | candidate_id из токена | – | привязка к токену | – |
| 23 | ai-interview-screen-resume | Скрининг резюме | CAND | false | ✅ `requireCandidateToken` | candidate_id из токена | – | привязка к токену | – |
| 24 | ai-list-interview-checklist | Чтение вопросов чек-листа без ответов | CAND | false | ✅ `requireCandidateToken` | через токен | – | привязка к токену | – |
| 25 | ai-list-stage-questions | Чтение вопросов этапа без ответов | CAND | false | ✅ `requireCandidateToken` | через токен | – | привязка к токену | – |
| 26 | ai-restart | Сброс ProTalk-диалога | EMP | false | ✅ `requireEmployerJwt` | – | – | JWT в коде | – |
| 27 | candidate-upload-file | Загрузка файла кандидата | CAND | false | ✅ существующая проверка `candidate_sessions` | candidate_id из токена | – | без изменений | – |
| 28 | demo-upload-resume | Публичная загрузка резюме демо | PUBLIC | false | ✅ существующий RL | – | ✅ | без изменений | – |
| 29 | reviews-ai-reply | AI-ответ на отзыв | EMP | false | ✅ существующая проверка | – | – | без изменений | – |
| 30 | reviews-submit | Создание отзыва | PUBLIC | false | ✅ существующий RL | – | ✅ | без изменений | – |
| 31 | robokassa-create | Создание счёта | EMP | **true** | ✅ JWT (gateway) + RPC | RPC `robokassa_create_invoice` использует `auth.uid()` | – | без изменений | – |
| 32 | robokassa-result | Callback Robokassa | RKS | false | ✅ подпись MD5 + InvId + сумма + идемпотентность RPC | – | – | без изменений | НЕЛЬЗЯ требовать JWT — серверный callback |
| 33 | signup-bootstrap | Bootstrap профиля после регистрации | EMP | false | ✅ existing JWT check | – | – | без изменений | – |

## Сводка

- Всего проверено: **33**
- Переведено на in-code JWT-валидацию работодателя: **17** (ai-chat, ai-enhance, ai-evaluate, ai-distribute-text, ai-company-analyze, ai-faq-assist, ai-restart, ai-ingest-document + 9 ai-generate-*)
- Переведено на проверку кандидатского токена: **7** (ai-list-interview-checklist, ai-list-stage-questions, ai-check-stage-answers, ai-check-text-answer, ai-interview-grade-checklist, ai-interview-grade-situations, ai-interview-screen-resume)
- Оставлены публичными (намеренно): **6** (3 demo, demo-upload-resume, reviews-submit, robokassa-result). Все либо имеют RL, либо защищены подписью.
- Robokassa-result остаётся без JWT по требованию ТЗ — безопасность через подпись.

## Где добавлен Ownership-контроль

- **Работодательские функции с project_id/candidate_id в теле**: после `requireEmployerJwt` функция проверяет `project.employer_id === claims.sub` (или company.owner_id) до выполнения операции.
- **Кандидатские функции**: `candidate_id` берётся из записи `candidate_sessions` (по присланному токену), а не из тела запроса — клиент не может выдать себя за другого кандидата.

## Что требует отдельного решения (риски)

1. **Rate-limit** на 3 demo-функциях — нужна таблица/RPC. Перенесено в Этап F (общая шлифовка).
2. **Ownership-проверка project_id в ai-generate-***: добавлена базовая проверка `project.employer_id`, но для совместных компаний (multi-employer per company) потребуется расширение в Этапе B вместе с моделью ролей.
3. **`ai-chat` rate-limit per-user** — отдельный заход, не входит в A1.
4. **`Shp_*` подпись Robokassa** — будет в Этапе D вместе с фискализацией.
5. Демо-функции (3) — не выполняют запись в БД и не списывают RR; риск только в стоимости AI-вызовов → закрывается RL.
