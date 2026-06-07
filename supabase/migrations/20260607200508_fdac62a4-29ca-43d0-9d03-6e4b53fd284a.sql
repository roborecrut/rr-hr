
-- Extend admin_list_employers to expose all credit/limit columns
CREATE OR REPLACE FUNCTION public.admin_list_employers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'public_id', e.public_id,
    'user_id', e.user_id,
    'email', p.email,
    'name', p.display_name,
    'contact_phone', e.contact_phone,
    'contact_telegram', e.contact_telegram,
    'created_at', e.created_at,
    'balance', COALESCE(w.units_balance, 0),
    'landing_credits', COALESCE(e.landing_credits, 0),
    'interview_setup_credits', COALESCE(e.interview_setup_credits, 0),
    'training_setup_credits',  COALESCE(e.training_setup_credits, 0),
    'interview_credits', COALESCE(e.interview_credits, 0),
    'training_credits',  COALESCE(e.training_credits, 0),
    'has_topup', EXISTS(SELECT 1 FROM public.transactions t WHERE t.wallet_id = w.id AND t.type='topup'::public.tx_type),
    'projects_count', (SELECT count(*) FROM public.projects pr WHERE pr.employer_id = e.id),
    'candidates_count', (SELECT count(*) FROM public.candidates c JOIN public.projects pr ON pr.id = c.project_id WHERE pr.employer_id = e.id)
  ) ORDER BY e.created_at DESC), '[]'::jsonb) INTO v
  FROM public.employers e
  LEFT JOIN public.profiles p ON p.id = e.user_id
  LEFT JOIN public.wallets w ON w.employer_id = e.id;
  RETURN v;
END $$;

-- Admin sets a single limit field on employers, logs to transactions
CREATE OR REPLACE FUNCTION public.admin_employer_set_limit(_employer uuid, _field text, _value integer, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_w public.wallets;
  v_old integer;
  v_label text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _field NOT IN ('landing_credits','interview_setup_credits','training_setup_credits','interview_credits','training_credits') THEN
    RAISE EXCEPTION 'bad_field';
  END IF;
  IF _value IS NULL OR _value < 0 THEN RAISE EXCEPTION 'bad_value'; END IF;

  v_label := CASE _field
    WHEN 'landing_credits'          THEN 'Вакансии (лендинги)'
    WHEN 'interview_setup_credits'  THEN 'Системы интервью'
    WHEN 'training_setup_credits'   THEN 'Системы обучения'
    WHEN 'interview_credits'        THEN 'Интервью'
    WHEN 'training_credits'         THEN 'Обучения'
  END;

  EXECUTE format('SELECT %I FROM public.employers WHERE id = $1', _field) INTO v_old USING _employer;
  EXECUTE format('UPDATE public.employers SET %I = $1, updated_at = now() WHERE id = $2', _field) USING _value, _employer;

  INSERT INTO public.wallets(employer_id) VALUES (_employer) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_w FROM public.wallets WHERE employer_id = _employer;

  INSERT INTO public.transactions(wallet_id, type, amount_rr, ref_table, ref_id, note)
    VALUES (v_w.id, 'bonus'::public.tx_type, 0, 'employers', _employer,
            COALESCE(_note,'Админ изменил лимит') || ': ' || v_label
            || ' (' || COALESCE(v_old,0) || ' → ' || _value || ')');

  RETURN jsonb_build_object('ok', true, 'field', _field, 'old', COALESCE(v_old,0), 'new', _value);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_employer_set_limit(uuid, text, integer, text) TO authenticated;
