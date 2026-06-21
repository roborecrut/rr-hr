
-- 1) projects: лимиты
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS interview_limit  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_limit   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interview_used   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_used    int NOT NULL DEFAULT 0;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_interview_used_le_limit
    CHECK (interview_used >= 0 AND interview_used <= interview_limit) NOT VALID;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_training_used_le_limit
    CHECK (training_used  >= 0 AND training_used  <= training_limit) NOT VALID;

-- 2) candidates: idempotency markers
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS training_charged_at  timestamptz;

-- 3) Status RPC (read-only): used by client gates before entering a stage.
CREATE OR REPLACE FUNCTION public.project_limit_status(
  _project   uuid,
  _candidate uuid,
  _kind      text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := 0;
  v_used  int := 0;
  v_already boolean := false;
  v_emp uuid;
  v_emp_name  text;
  v_emp_email text;
  v_emp_phone text;
BEGIN
  IF _kind NOT IN ('interview','training') THEN
    RAISE EXCEPTION 'bad_kind';
  END IF;

  IF _kind = 'interview' THEN
    SELECT interview_limit, interview_used, employer_id
      INTO v_limit, v_used, v_emp
      FROM public.projects WHERE id = _project;
  ELSE
    SELECT training_limit, training_used, employer_id
      INTO v_limit, v_used, v_emp
      FROM public.projects WHERE id = _project;
  END IF;

  IF _candidate IS NOT NULL THEN
    IF _kind = 'interview' THEN
      SELECT interview_charged_at IS NOT NULL INTO v_already
        FROM public.candidates WHERE id = _candidate;
    ELSE
      SELECT training_charged_at IS NOT NULL INTO v_already
        FROM public.candidates WHERE id = _candidate;
    END IF;
  END IF;

  SELECT contact_name, contact_email, contact_phone
    INTO v_emp_name, v_emp_email, v_emp_phone
    FROM public.employers WHERE id = v_emp;

  RETURN jsonb_build_object(
    'kind', _kind,
    'limit', v_limit,
    'used',  v_used,
    'remaining', GREATEST(0, v_limit - v_used),
    'has_capacity', (v_used < v_limit),
    'already_charged', COALESCE(v_already, false),
    'employer', jsonb_build_object(
      'name',  v_emp_name,
      'email', v_emp_email,
      'phone', v_emp_phone
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.project_limit_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_limit_status(uuid, uuid, text) TO authenticated, anon, service_role;

-- 4) Charge RPC (write): idempotent per (candidate, kind).
CREATE OR REPLACE FUNCTION public.charge_project_limit(
  _candidate uuid,
  _kind      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_already timestamptz;
  v_limit int := 0;
  v_used  int := 0;
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _kind NOT IN ('interview','training') THEN RAISE EXCEPTION 'bad_kind'; END IF;

  SELECT project_id,
         CASE WHEN _kind='interview' THEN interview_charged_at ELSE training_charged_at END
    INTO v_project, v_already
    FROM public.candidates WHERE id = _candidate;

  IF v_project IS NULL THEN RAISE EXCEPTION 'no_project_for_candidate'; END IF;

  -- Idempotent: уже списано — возвращаем already=true.
  IF v_already IS NOT NULL THEN
    IF _kind='interview' THEN
      SELECT interview_limit, interview_used INTO v_limit, v_used FROM public.projects WHERE id = v_project;
    ELSE
      SELECT training_limit,  training_used  INTO v_limit, v_used FROM public.projects WHERE id = v_project;
    END IF;
    RETURN jsonb_build_object('ok',true,'already',true,'limit',v_limit,'used',v_used,'remaining',GREATEST(0,v_limit-v_used));
  END IF;

  -- Атомарный инкремент с проверкой ёмкости.
  IF _kind='interview' THEN
    UPDATE public.projects
       SET interview_used = interview_used + 1
     WHERE id = v_project AND interview_used < interview_limit
     RETURNING interview_limit, interview_used INTO v_limit, v_used;
  ELSE
    UPDATE public.projects
       SET training_used = training_used + 1
     WHERE id = v_project AND training_used < training_limit
     RETURNING training_limit, training_used INTO v_limit, v_used;
  END IF;

  IF NOT FOUND THEN
    -- лимит исчерпан
    IF _kind='interview' THEN
      SELECT interview_limit, interview_used INTO v_limit, v_used FROM public.projects WHERE id = v_project;
    ELSE
      SELECT training_limit,  training_used  INTO v_limit, v_used FROM public.projects WHERE id = v_project;
    END IF;
    RETURN jsonb_build_object('ok',false,'error','no_capacity','limit',v_limit,'used',v_used,'remaining',0);
  END IF;

  -- Поставить отметку идемпотентности на кандидате.
  IF _kind='interview' THEN
    UPDATE public.candidates SET interview_charged_at = now() WHERE id = _candidate;
  ELSE
    UPDATE public.candidates SET training_charged_at  = now() WHERE id = _candidate;
  END IF;

  RETURN jsonb_build_object('ok',true,'already',false,'limit',v_limit,'used',v_used,'remaining',GREATEST(0,v_limit-v_used));
END;
$$;

REVOKE ALL ON FUNCTION public.charge_project_limit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_project_limit(uuid, text) TO service_role;
