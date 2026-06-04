
-- ============ 1. Конвертация юнитов в RR (×100) ============
UPDATE public.wallets SET units_balance = units_balance * 100 WHERE units_balance > 0;
UPDATE public.transactions SET amount_rr = amount_rr * 100;

-- ============ 2. Бонус 1000 RR при регистрации ============
CREATE OR REPLACE FUNCTION public.grant_employer_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (NEW.id) ON CONFLICT (employer_id) DO NOTHING;
  IF NOT NEW.bonus_granted THEN
    PERFORM public.apply_transaction(NEW.id, 'bonus'::public.tx_type, 1000, 'employers', NEW.id, 'Приветственный бонус: 1000 RR');
    UPDATE public.employers SET bonus_granted = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;

-- ============ 3. Счётчики пакетных лимитов ============
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS interview_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_credits  INT NOT NULL DEFAULT 0;

-- ============ 4. Идемпотентность транзакций ============
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS idem_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_idem ON public.transactions(idem_key) WHERE idem_key IS NOT NULL;

-- ============ 5. Тарифная сетка для пакетов ============
CREATE OR REPLACE FUNCTION public.pack_tier_price(_qty int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _qty <= 9    THEN 200
    WHEN _qty <= 49   THEN 150
    WHEN _qty <= 199  THEN 100
    ELSE 50
  END
$$;

-- ============ 6. Покупка пакета (interview|training) ============
CREATE OR REPLACE FUNCTION public.purchase_pack(_kind text, _qty int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp     public.employers;
  v_unit    int;
  v_total   int;
  v_wallet  public.wallets;
BEGIN
  IF _kind NOT IN ('interview','training') THEN
    RAISE EXCEPTION 'bad_kind';
  END IF;
  IF _qty IS NULL OR _qty < 1 THEN
    RAISE EXCEPTION 'bad_qty';
  END IF;

  SELECT * INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  v_unit  := public.pack_tier_price(_qty);
  v_total := v_unit * _qty;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp.id) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp.id FOR UPDATE;
  IF v_wallet.units_balance < v_total THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  UPDATE public.wallets SET units_balance = units_balance - v_total, updated_at = now() WHERE id = v_wallet.id;

  IF _kind = 'interview' THEN
    UPDATE public.employers SET interview_credits = interview_credits + _qty WHERE id = v_emp.id;
  ELSE
    UPDATE public.employers SET training_credits  = training_credits  + _qty WHERE id = v_emp.id;
  END IF;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_total, 'employers', v_emp.id,
          'Покупка пакета: ' || _kind || ' ×' || _qty || ' по ' || v_unit || ' RR/шт');

  RETURN jsonb_build_object('ok', true, 'qty', _qty, 'unit', v_unit, 'total', v_total);
END $$;

REVOKE ALL ON FUNCTION public.purchase_pack(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_pack(text,int) TO authenticated, service_role;

-- ============ 7. Расход пакетного лимита при старте этапа ============
CREATE OR REPLACE FUNCTION public.spend_pack(_candidate uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_emp  uuid;
  v_left int;
  v_idem text;
  v_wallet public.wallets;
BEGIN
  IF _kind NOT IN ('interview','training') THEN
    RAISE EXCEPTION 'bad_kind';
  END IF;

  SELECT c.user_id, p.employer_id INTO v_user, v_emp
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = _candidate;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'pack:' || _kind || ':' || _candidate::text;

  -- Идемпотентность: если уже списано — вернуть успех без повторного списания
  IF EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _kind = 'interview' THEN
    UPDATE public.employers SET interview_credits = interview_credits - 1
      WHERE id = v_emp AND interview_credits > 0
      RETURNING interview_credits INTO v_left;
  ELSE
    UPDATE public.employers SET training_credits = training_credits - 1
      WHERE id = v_emp AND training_credits > 0
      RETURNING training_credits INTO v_left;
  END IF;

  IF v_left IS NULL THEN
    RAISE EXCEPTION 'no_credits';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;
  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'candidates', _candidate,
          'Списан лимит: ' || _kind, v_idem);

  RETURN jsonb_build_object('ok', true, 'left', v_left);
END $$;

REVOKE ALL ON FUNCTION public.spend_pack(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_pack(uuid,text) TO authenticated, service_role;

-- ============ 8. Фиксированное списание (landing/interview_setup/training_setup) ============
CREATE OR REPLACE FUNCTION public.spend_fixed(_project uuid, _item text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_user uuid;
  v_amount int;
  v_idem text;
  v_wallet public.wallets;
  v_label text;
BEGIN
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN
    RAISE EXCEPTION 'bad_item';
  END IF;

  v_amount := CASE _item
    WHEN 'landing'          THEN 500
    WHEN 'interview_setup'  THEN 200
    WHEN 'training_setup'   THEN 300
  END;
  v_label := CASE _item
    WHEN 'landing'          THEN 'ИИ-Лендинг вакансии'
    WHEN 'interview_setup'  THEN 'ИИ-Система интервью'
    WHEN 'training_setup'   THEN 'ИИ-Система обучения'
  END;

  SELECT p.employer_id, e.user_id INTO v_emp, v_user
    FROM public.projects p JOIN public.employers e ON e.id = p.employer_id
    WHERE p.id = _project;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_project'; END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'fixed:' || _item || ':' || _project::text;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;
  IF v_wallet.units_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  UPDATE public.wallets SET units_balance = units_balance - v_amount, updated_at = now() WHERE id = v_wallet.id;
  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_amount, 'projects', _project, v_label, v_idem);

  RETURN jsonb_build_object('ok', true, 'amount', v_amount);
END $$;

REVOKE ALL ON FUNCTION public.spend_fixed(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed(uuid,text) TO authenticated, service_role;
