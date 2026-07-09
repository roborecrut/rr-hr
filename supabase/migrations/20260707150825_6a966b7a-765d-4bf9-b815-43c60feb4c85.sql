
CREATE OR REPLACE FUNCTION public.debit_ai_job_once(
  _job_id uuid,
  _candidate uuid,
  _charge_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_outcome jsonb;
BEGIN
  IF _charge_kind NOT IN ('resume_screen','checklist_grade','situations_grade') THEN
    RAISE EXCEPTION 'bad_charge_kind';
  END IF;

  PERFORM 1 FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_job_not_found'; END IF;

  SELECT outcome INTO v_existing
  FROM public.ai_job_debits
  WHERE job_id = _job_id AND charge_kind = _charge_kind;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'outcome', v_existing);
  END IF;

  -- Списание теперь идёт с лимита вакансии (projects.interview_used),
  -- а не с общего пакета employers.interview_credits.
  -- charge_project_limit идемпотентна на уровне кандидата (candidates.interview_charged_at),
  -- поэтому повторное списание не произойдёт.
  v_outcome := public.charge_project_limit(_candidate, 'interview');

  INSERT INTO public.ai_job_debits (job_id, charge_kind, outcome)
  VALUES (_job_id, _charge_kind, v_outcome)
  ON CONFLICT (job_id, charge_kind) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'already', false, 'outcome', v_outcome);
END;
$$;
