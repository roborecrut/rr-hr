
-- A. Per-item fixed-service credit counters
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS landing_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interview_setup_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_setup_credits INT NOT NULL DEFAULT 0;

-- B. Mixed pack purchase: price tier from sum(qty_int + qty_train)
CREATE OR REPLACE FUNCTION public.purchase_pack_mixed(_qty_int int, _qty_train int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp     public.employers;
  v_unit    int;
  v_total_qty int;
  v_total_rr  int;
  v_wallet  public.wallets;
BEGIN
  _qty_int   := COALESCE(_qty_int, 0);
  _qty_train := COALESCE(_qty_train, 0);
  IF _qty_int < 0 OR _qty_train < 0 THEN RAISE EXCEPTION 'bad_qty'; END IF;
  v_total_qty := _qty_int + _qty_train;
  IF v_total_qty < 1 THEN RAISE EXCEPTION 'bad_qty'; END IF;

  SELECT * INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  v_unit     := public.pack_tier_price(v_total_qty);
  v_total_rr := v_unit * v_total_qty;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp.id) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp.id FOR UPDATE;
  IF v_wallet.units_balance < v_total_rr THEN RAISE EXCEPTION 'insufficient_funds'; END IF;

  UPDATE public.wallets SET units_balance = units_balance - v_total_rr, updated_at = now() WHERE id = v_wallet.id;
  UPDATE public.employers
    SET interview_credits = interview_credits + _qty_int,
        training_credits  = training_credits  + _qty_train
    WHERE id = v_emp.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_total_rr, 'employers', v_emp.id,
          'Пакет: ' || _qty_int || ' инт + ' || _qty_train || ' обуч × ' || v_unit || ' RR/шт');

  RETURN jsonb_build_object(
    'ok', true,
    'qty_int', _qty_int, 'qty_train', _qty_train,
    'total_qty', v_total_qty, 'unit', v_unit, 'total_rr', v_total_rr
  );
END $$;

REVOKE ALL ON FUNCTION public.purchase_pack_mixed(int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_pack_mixed(int,int) TO authenticated, service_role;

-- C. Buy fixed-service prepayments (landing/interview_setup/training_setup) in bulk
CREATE OR REPLACE FUNCTION public.purchase_fixed(_item text, _qty int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp public.employers;
  v_unit int;
  v_total int;
  v_wallet public.wallets;
  v_label text;
BEGIN
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN RAISE EXCEPTION 'bad_item'; END IF;
  IF _qty IS NULL OR _qty < 1 THEN RAISE EXCEPTION 'bad_qty'; END IF;

  SELECT * INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  v_unit := CASE _item
    WHEN 'landing' THEN 500
    WHEN 'interview_setup' THEN 200
    WHEN 'training_setup' THEN 300
  END;
  v_label := CASE _item
    WHEN 'landing' THEN 'ИИ-Лендинг вакансии'
    WHEN 'interview_setup' THEN 'ИИ-Система интервью'
    WHEN 'training_setup' THEN 'ИИ-Система обучения'
  END;
  v_total := v_unit * _qty;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp.id) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp.id FOR UPDATE;
  IF v_wallet.units_balance < v_total THEN RAISE EXCEPTION 'insufficient_funds'; END IF;

  UPDATE public.wallets SET units_balance = units_balance - v_total, updated_at = now() WHERE id = v_wallet.id;

  IF _item = 'landing' THEN
    UPDATE public.employers SET landing_credits = landing_credits + _qty WHERE id = v_emp.id;
  ELSIF _item = 'interview_setup' THEN
    UPDATE public.employers SET interview_setup_credits = interview_setup_credits + _qty WHERE id = v_emp.id;
  ELSE
    UPDATE public.employers SET training_setup_credits = training_setup_credits + _qty WHERE id = v_emp.id;
  END IF;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_total, 'employers', v_emp.id,
          'Покупка впрок: ' || v_label || ' ×' || _qty);

  RETURN jsonb_build_object('ok', true, 'item', _item, 'qty', _qty, 'unit', v_unit, 'total_rr', v_total);
END $$;

REVOKE ALL ON FUNCTION public.purchase_fixed(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_fixed(text,int) TO authenticated, service_role;

-- D. spend_fixed: use prepaid credit if available, otherwise charge balance
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
  v_credits int;
  v_used_credit boolean := false;
BEGIN
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN RAISE EXCEPTION 'bad_item'; END IF;

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

  -- Try to consume a prepaid credit first
  IF _item = 'landing' THEN
    UPDATE public.employers SET landing_credits = landing_credits - 1
      WHERE id = v_emp AND landing_credits > 0
      RETURNING landing_credits INTO v_credits;
  ELSIF _item = 'interview_setup' THEN
    UPDATE public.employers SET interview_setup_credits = interview_setup_credits - 1
      WHERE id = v_emp AND interview_setup_credits > 0
      RETURNING interview_setup_credits INTO v_credits;
  ELSE
    UPDATE public.employers SET training_setup_credits = training_setup_credits - 1
      WHERE id = v_emp AND training_setup_credits > 0
      RETURNING training_setup_credits INTO v_credits;
  END IF;
  v_used_credit := v_credits IS NOT NULL;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;

  IF v_used_credit THEN
    INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
    VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'projects', _project,
            v_label || ' (из лимита)', v_idem);
    RETURN jsonb_build_object('ok', true, 'used_credit', true, 'left', v_credits);
  END IF;

  IF v_wallet.units_balance < v_amount THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  UPDATE public.wallets SET units_balance = units_balance - v_amount, updated_at = now() WHERE id = v_wallet.id;
  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_amount, 'projects', _project, v_label, v_idem);

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'used_credit', false);
END $$;

REVOKE ALL ON FUNCTION public.spend_fixed(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed(uuid,text) TO authenticated, service_role;

-- E. Bring legacy referral bonus_units up to actual awarded amount
UPDATE public.referrals_emp SET bonus_units = 1000 WHERE bonus_units < 1000;
