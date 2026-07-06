CREATE OR REPLACE FUNCTION public.spend_fixed_for_employer(
  _employer_public_id text,
  _project uuid,
  _item text,
  _prefer text DEFAULT 'credit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN
    RAISE EXCEPTION 'bad_item';
  END IF;
  IF _prefer NOT IN ('credit','balance') THEN
    _prefer := 'credit';
  END IF;
  IF coalesce(trim(_employer_public_id), '') = '' THEN
    RAISE EXCEPTION 'bad_employer';
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

  SELECT p.employer_id, e.user_id
    INTO v_emp, v_user
  FROM public.projects p
  JOIN public.employers e ON e.id = p.employer_id
  WHERE p.id = _project
    AND e.public_id = _employer_public_id;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'project_employer_mismatch';
  END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'fixed:' || _item || ':' || _project::text;

  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.wallets w ON w.id = t.wallet_id
    WHERE t.idem_key = v_idem
      AND w.employer_id = v_emp
  ) THEN
    IF _item = 'interview_setup' THEN
      INSERT INTO public.interview_systems (project_id, created_by, status, source)
      VALUES (_project, auth.uid(), 'draft', 'spend_fixed_already')
      ON CONFLICT (project_id) DO UPDATE
        SET updated_at = now(),
            source = CASE
              WHEN public.interview_systems.source IN ('manual', 'backfill_blocks') THEN excluded.source
              ELSE public.interview_systems.source
            END;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _prefer = 'credit' THEN
    IF _item = 'landing' THEN
      UPDATE public.employers
      SET landing_credits = landing_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND landing_credits > 0
      RETURNING landing_credits INTO v_credits;
    ELSIF _item = 'interview_setup' THEN
      UPDATE public.employers
      SET interview_setup_credits = interview_setup_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND interview_setup_credits > 0
      RETURNING interview_setup_credits INTO v_credits;
    ELSE
      UPDATE public.employers
      SET training_setup_credits = training_setup_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND training_setup_credits > 0
      RETURNING training_setup_credits INTO v_credits;
    END IF;
    v_used_credit := v_credits IS NOT NULL;
  END IF;

  INSERT INTO public.wallets (employer_id)
  VALUES (v_emp)
  ON CONFLICT (employer_id) DO NOTHING;

  SELECT *
    INTO v_wallet
  FROM public.wallets
  WHERE employer_id = v_emp
  FOR UPDATE;

  IF v_used_credit THEN
    INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
    VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'projects', _project,
            v_label || ' (из лимита)', v_idem);

    IF _item = 'interview_setup' THEN
      INSERT INTO public.interview_systems (project_id, created_by, status, source)
      VALUES (_project, auth.uid(), 'draft', 'spend_fixed_credit')
      ON CONFLICT (project_id) DO UPDATE
        SET updated_at = now(),
            source = excluded.source;
    END IF;

    RETURN jsonb_build_object('ok', true, 'used_credit', true, 'left', v_credits);
  END IF;

  IF v_wallet.units_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  UPDATE public.wallets
  SET units_balance = units_balance - v_amount,
      updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_amount, 'projects', _project, v_label, v_idem);

  IF _item = 'interview_setup' THEN
    INSERT INTO public.interview_systems (project_id, created_by, status, source)
    VALUES (_project, auth.uid(), 'draft', 'spend_fixed_balance')
    ON CONFLICT (project_id) DO UPDATE
      SET updated_at = now(),
          source = excluded.source;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'used_credit', false);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_fixed_for_employer(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed_for_employer(text, uuid, text, text) TO authenticated, service_role;