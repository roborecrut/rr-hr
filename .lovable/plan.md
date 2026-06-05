
## Что меняем

### 1) Единая тарифная сетка для интервью+обучения (по сумме штук)

Сейчас покупка идёт раздельно: 7 интервью и 3 обучения тарифицируются как два маленьких пакета (по 200 RR), вместо общего 10 шт. по 150 RR.

- В UI «Тариф & Счета» одна форма выбора пакета: пользователь указывает **сколько интервью** и **сколько обучений** в одном пакете. Грейд цены берётся от **суммы** (qty_int + qty_train).
- В БД переписываем `public.purchase_pack` → `public.purchase_pack_mixed(_qty_int int, _qty_train int)`:
  - `total_qty = _qty_int + _qty_train`, `unit = pack_tier_price(total_qty)`, `total_rr = unit*total_qty`
  - проверяет баланс, списывает, начисляет в `employers.interview_credits` и `employers.training_credits` раздельно, пишет одну транзакцию с пометкой `Пакет: N инт + M обуч × <unit> RR`.
- Старый `purchase_pack(_kind,_qty)` оставляем как обёртку для обратной совместимости (вызывает `purchase_pack_mixed`).
- Списание (`spend_pack`) уже работает корректно — расходует **по 1 шт.** из нужного счётчика при первом старте ИИ-интервью/ИИ-обучения кандидатом и привязано к `candidate_id` (идемпотентно). Оставляем как есть. Проверяем, что на стороне фронта вызовы `spend_pack('interview' | 'training')` действительно срабатывают в `CandidateFlow` при первом клике «Приступить» — если нет, добавим.

### 2) Отдельные покупки фикс-услуг (лендинг / интервью-сетап / обучение-сетап)

Сейчас `spend_fixed` существует в БД, но **нигде не вызывается** и счётчиков нет.

- Добавляем в `public.employers`:
  - `landing_credits INT NOT NULL DEFAULT 0`
  - `interview_setup_credits INT NOT NULL DEFAULT 0`
  - `training_setup_credits INT NOT NULL DEFAULT 0`
- Новая RPC `purchase_fixed(_item text, _qty int default 1)`: списывает `FIXED_PRICES[item]*qty` (500/200/300 RR), инкрементит соответствующий счётчик, пишет транзакцию.
- Переписываем `spend_fixed(_project, _item)`:
  - если у работодателя есть `*_credits > 0` → расходует 1 кредит без списания RR (идемпотентно по `_project+_item`);
  - иначе списывает фикс-цену с баланса (как сейчас).
- В edge-функциях вызываем `spend_fixed` после успешного сохранения:
  - `ai-generate-onboarding` → при `save && project_id` вызываем `spend_fixed(project_id,'interview_setup')` после успешной записи чек-листа/ситуаций и `spend_fixed(project_id,'training_setup')` после успешной записи training_blocks.
  - Для лендинга — после сохранения `project_landings` (см. вызов в `EmployerPanel`/`JobVacancyLanding` генерации) добавляем `spend_fixed(project_id,'landing')`. Если генерации лендинга через edge-функцию ещё нет — RPC вызываем прямо из фронта после успешной записи.
- В UI блока «Разовые услуги» добавляем кнопки **«Купить впрок»** и счётчики «Куплено: N шт» рядом с каждой услугой. Подпись: «спишется автоматически при создании; если кредитов нет — спишется с баланса».

### 3) Корректное отображение баланса и реферальной программы

- Кнопка раздела «5. Тариф & Счета» в сайдбаре сейчас показывает старое значение (1000 RR на скрине, хотя в БД 2000). Источник `balance` обновляем единым хуком `useWallet()` с интервальным `fetchBillingState` (он есть, но не используется для бейджа в сайдбаре) — пробрасываем `balance` в бейдж сайдбара.
- Баг «Кем вы приглашены = самостоятельно» при наличии записи в `referrals_emp`:
  - проверяем, что запрос `referrals_emp` идёт под JWT текущего пользователя (RLS-политика уже разрешает чтение приглашённому);
  - чиним маппинг `referrer.public_id` (сейчас отдельный запрос — корректен, но не отрабатывает на странице). Перепишем на один JOIN-запрос с `select("referrer:employers!referrals_emp_referrer_employer_id_fkey(public_id, contact_phone, contact_telegram, user_id)")`, чтобы RLS не резал второй шаг.
  - В блоке «Кем вы приглашены» выводим: ID работодателя (emp1000XX), имя, email, телефон, telegram приглашающего.
- Баг «Кого пригласили вы: 0 чел» при наличии реферала:
  - аналогично переписываем выборку приглашённых одним `select` c вложенным `employers→profiles`;
  - в шапке блока выводим суммарно `count` и сумму бонусов: `{N} чел · +{sum} RR`.
- Запись `referrals_emp.bonus_units` сейчас 10 (легаси), а реальный бонус 1000 RR (через `apply_transaction`). Делаем одноразовый `UPDATE referrals_emp SET bonus_units = 1000 WHERE bonus_units = 10`, чтобы суммарный показатель в UI совпадал с реальным начислением.

## Технические детали

### Миграция (SQL)

```sql
-- A. Новые счётчики для фикс-услуг
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS landing_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interview_setup_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_setup_credits INT NOT NULL DEFAULT 0;

-- B. purchase_pack_mixed(qty_int, qty_train) — единый грейд по сумме
CREATE OR REPLACE FUNCTION public.purchase_pack_mixed(_qty_int int, _qty_train int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ ... $$;

-- C. purchase_fixed(item, qty)
CREATE OR REPLACE FUNCTION public.purchase_fixed(_item text, _qty int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ ... $$;

-- D. spend_fixed: расходовать кредит, если есть; иначе списать с баланса
CREATE OR REPLACE FUNCTION public.spend_fixed(_project uuid, _item text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ ... $$;

-- E. Привести легаси bonus_units к фактически начисленным RR
UPDATE public.referrals_emp SET bonus_units = 1000 WHERE bonus_units = 10;

GRANT EXECUTE ON FUNCTION public.purchase_pack_mixed(int,int), public.purchase_fixed(text,int) TO authenticated, service_role;
```

### Фронт

- `src/lib/rr.ts` — без изменений (тарифная сетка уже общая).
- `src/pages/EmployerPanel.tsx`:
  - Заменить блок «Пакеты лимитов» на единую форму: два инпута (qty_int, qty_train) + сводка «Всего N шт × U RR = T RR»; кнопка вызывает `supabase.rpc('purchase_pack_mixed', { _qty_int, _qty_train })`.
  - В блок «Разовые услуги» добавить кнопки покупки впрок и счётчики `landing_credits`, `interview_setup_credits`, `training_setup_credits` (загружаем в `fetchBillingState`).
  - Переписать запрос рефералов на JOIN, корректно показать «Кем вы приглашены» и «Кого пригласили вы» (счётчик + список с email/телефон/telegram).
  - В сайдбаре бейдж раздела «5. Тариф & Счета» брать из стейта `balance`.
- `supabase/functions/ai-generate-onboarding/index.ts` — после успешного `save` вызывать `spend_fixed` для `interview_setup` и `training_setup`.
- Где сохраняется лендинг (`project_landings`) — добавить `supabase.rpc('spend_fixed', { _project, _item: 'landing' })` сразу после успешной записи.
- `CandidateFlow.tsx` — убедиться, что при первом старте ИИ-интервью и ИИ-обучения вызывается `supabase.rpc('spend_pack', { _candidate, _kind })`; добавить, если нет.

## Чего НЕ делаем

- Не меняем формулу пополнения RR за рубли (1 ₽ = 1 RR) и приветственный бонус 1000 RR.
- Не трогаем ProTalk/edge-функции AI кроме добавления вызова `spend_fixed`.
- Не меняем структуру `wallets` и `transactions`.
