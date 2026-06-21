## Что делаем

Реализуем единую систему лимитов RR на интервью и обучение по каждой вакансии, списание лимитов из баланса работодателя на правильных этапах кандидата, оверлей-блокировку при нехватке лимитов и бесплатное демо-прохождение интервью самим работодателем.

---

## 1. Схема БД (миграция)

**`projects`** (вакансия) — новые поля:
- `interview_limit` int NOT NULL DEFAULT 0 — сколько кандидатов могут пройти интервью
- `training_limit` int NOT NULL DEFAULT 0 — сколько кандидатов могут пройти обучение
- `interview_used` int NOT NULL DEFAULT 0 — фактически списано интервью
- `training_used` int NOT NULL DEFAULT 0 — фактически списано обучений

**`candidates`** — новые флаги (идемпотентность списаний):
- `interview_charged_at` timestamptz — момент первого успешного списания интервью
- `training_charged_at` timestamptz — момент первого успешного списания обучения

**RPC `charge_project_limit(_candidate uuid, _kind text)`** (SECURITY DEFINER):
- атомарно: проверяет `interview_charged_at`/`training_charged_at` — если уже списано, возвращает `{ok:true, already:true}`;
- проверяет `interview_used < interview_limit` (или training);
- инкрементит `projects.<kind>_used`;
- ставит `candidates.<kind>_charged_at = now()`;
- возвращает `{ok, already, remaining, limit, employer_id, employer_phone, employer_email, employer_name}`.

**RPC `project_limit_status(_project uuid, _candidate uuid, _kind text)`** — read-only: для гейта на входе в этап. Возвращает `{has_capacity, already_charged, remaining, limit, employer_contacts}`.

---

## 2. Edge-функции

**`ai-interview-screen-resume-v2`** — после успешного скоринга резюме вызвать `charge_project_limit(candidate, 'interview')`. На ошибке `no_capacity` всё равно сохранить результат скрининга, но вернуть флаг `limit_exhausted` для UI.

**`ai-check-stage-answers`** (или функция проверки профтеста) — после успешного ответа нейронки на ПЕРВЫЙ тест в обучении (профессиональный) вызвать `charge_project_limit(candidate, 'training')`.

Демо-флоу работодателя (`employer-demo-interview-*`) — НЕ вызывает `charge_project_limit`.

---

## 3. Клиент кандидата (`CandidateInterview`, `CandidateStageTraining`)

- При монтировании этапа резюме → `project_limit_status('interview')`. Если `has_capacity=false && !already_charged` → показать оверлей с маскотом «Услуга интервью не подключена. Свяжитесь с работодателем: {имя, email, телефон}». Запретить дальнейшие действия.
- Аналогично при первом входе в обучение → `project_limit_status('training')`.
- Повторное прохождение (когда `already_charged=true`) — не блокируем, не списываем.

Оверлей: новый компонент `LimitExhaustedOverlay` с маскотом и контактами работодателя.

---

## 4. Редактор вакансии и обучения (работодатель)

В `VacancyEditor` и в редакторе обучения добавить обязательный блок «Лимиты RR»:
- два числовых поля: «Сколько кандидатов могут пройти интервью» и «Сколько кандидатов могут пройти обучение»;
- по умолчанию = max возможное (баланс RR работодателя / стоимость одного интервью или обучения);
- live-калькулятор: показывает «Из вашего баланса {balance} RR. 1 интервью = X RR, 1 обучение = Y RR. Зарезервировано по вакансии: {limit*X + limit*Y} RR»;
- при нулевом балансе — модалка «Пополнить лимиты» со ссылкой на раздел «Счета».

Валидация на сохранение: `interview_limit >= interview_used`, `training_limit >= training_used`.

---

## 5. Бонус — демо-прохождение интервью работодателем

В карточке системы интервью (там же, где «Опубликовать») добавить кнопку **«Пройти интервью как кандидат (бесплатно)»**.

- Маршрут `/employer/interview-preview/:projectId`.
- Использует те же компоненты этапов (резюме, чек-лист, ситуации), что и кандидат.
- Все ответы и оценки сохраняются ТОЛЬКО в `localStorage` (`emp_preview:{project_id}`), в БД ничего не пишется.
- На каждом этапе кнопка «Пересдать этап» — стирает локальное состояние этапа.
- AI-вызовы используют отдельный chat_id: `300000+employer_public_id` (диапазон уже есть в `buildChatId`), демо-флаг `employer_preview: true` → edge-функции пропускают `charge_project_limit` и пропускают запись в `candidate_scores`.
- Показываются итоговые баллы + текстовая рекомендация «отрегулируйте проходной балл, если оценка кажется завышенной/заниженной» со ссылкой обратно в редактор.

---

## Технические детали

- Цена 1 интервью / 1 обучения берётся из существующих констант RR (если их нет — добавить в `src/lib/rr.ts`).
- Все списания идут через единую RPC под `service_role` — никаких прямых UPDATE из клиента.
- Идемпотентность списания обеспечивает столбец `*_charged_at` на кандидате + уникальное условие в RPC.
- Демо работодателя не создаёт записей в `candidates` — компоненты этапов получают пропс `mode: "employer_preview"`.

После одобрения плана начну с миграции БД, затем edge-функции, затем клиент.
