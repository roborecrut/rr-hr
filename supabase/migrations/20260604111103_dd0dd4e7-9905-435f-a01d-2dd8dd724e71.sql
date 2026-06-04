-- Лимиты на вакансию
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS max_interviews INTEGER,
  ADD COLUMN IF NOT EXISTS max_trainings  INTEGER;

-- Функция списания 1 юнита (security definer)
CREATE OR REPLACE FUNCTION public.spend_unit(_candidate uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_employer uuid;
  v_user uuid;
  v_max int;
  v_used int;
  v_units int;
BEGIN
  IF _kind NOT IN ('interview','training') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_kind');
  END IF;

  SELECT c.project_id, c.user_id INTO v_project, v_user
    FROM public.candidates c WHERE c.id = _candidate;
  IF v_project IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_candidate');
  END IF;

  -- only the candidate themselves (or admin) may spend on their behalf
  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT p.employer_id,
         CASE WHEN _kind='interview' THEN p.max_interviews ELSE p.max_trainings END
    INTO v_employer, v_max
    FROM public.projects p WHERE p.id = v_project;

  -- лимит вакансии
  IF v_max IS NOT NULL THEN
    IF _kind = 'interview' THEN
      SELECT count(*) INTO v_used FROM public.interviews i
        JOIN public.candidates c ON c.id = i.candidate_id
        WHERE c.project_id = v_project AND i.started_at IS NOT NULL;
    ELSE
      SELECT count(DISTINCT ctp.candidate_id) INTO v_used
        FROM public.candidate_training_progress ctp
        JOIN public.candidates c ON c.id = ctp.candidate_id
        WHERE c.project_id = v_project;
    END IF;
    IF v_used >= v_max THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'vacancy_limit', 'used', v_used, 'max', v_max);
    END IF;
  END IF;

  -- баланс
  INSERT INTO public.wallets (employer_id) VALUES (v_employer) ON CONFLICT (employer_id) DO NOTHING;
  SELECT units_balance INTO v_units FROM public.wallets WHERE employer_id = v_employer FOR UPDATE;
  IF coalesce(v_units,0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_units');
  END IF;

  UPDATE public.wallets SET units_balance = units_balance - 1, updated_at = now()
    WHERE employer_id = v_employer;

  RETURN jsonb_build_object('ok', true, 'units_left', v_units - 1);
END $$;

GRANT EXECUTE ON FUNCTION public.spend_unit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_unit(uuid, text) TO service_role;