
CREATE OR REPLACE FUNCTION public.candidate_email_signup(_email text, _password text, _project uuid, _company uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(_email));
  v_role  text;
  v_company uuid := _company;
  v_existing public.candidates;
  v_cand public.candidates;
  v_token uuid;
  v_hash text;
  v_status public.entity_status;
  v_pub boolean;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_email');
  END IF;
  IF _password IS NULL OR length(_password) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_password');
  END IF;
  IF _project IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;

  SELECT role_name, company_id, status, is_published INTO v_role, v_company, v_status, v_pub
    FROM public.projects WHERE id = _project;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF v_status IS DISTINCT FROM 'active' OR COALESCE(v_pub,false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vacancy_inactive');
  END IF;
  IF _company IS NOT NULL THEN v_company := _company; END IF;

  SELECT * INTO v_existing FROM public.candidates
    WHERE lower(email) = v_email AND project_id = _project
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.password_hash IS NULL OR v_existing.password_hash <> crypt(_password, v_existing.password_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
    UPDATE public.candidates SET last_login_at = now() WHERE id = v_existing.id;
    INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_existing.id)
      RETURNING token INTO v_token;
    RETURN jsonb_build_object('ok', true, 'candidate_id', v_existing.id,
      'public_id', v_existing.public_id, 'project_id', v_existing.project_id,
      'company_id', v_existing.company_id, 'token', v_token, 'already', true);
  END IF;

  SELECT password_hash INTO v_hash FROM public.candidates
    WHERE lower(email) = v_email AND password_hash IS NOT NULL
    LIMIT 1;
  IF v_hash IS NOT NULL THEN
    IF v_hash <> crypt(_password, v_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
  ELSE
    v_hash := crypt(_password, gen_salt('bf'));
  END IF;

  INSERT INTO public.candidates (
    email, password_hash, project_id, company_id,
    role_name, registered_via, current_stage, auth_kind
  ) VALUES (
    v_email, v_hash, _project, v_company, v_role,
    'email'::public.registration_method,
    'terms'::public.candidate_stage,
    'email'
  ) RETURNING * INTO v_cand;

  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  RETURN jsonb_build_object('ok', true, 'candidate_id', v_cand.id,
    'public_id', v_cand.public_id, 'project_id', v_cand.project_id,
    'company_id', v_cand.company_id, 'token', v_token);
END $function$;
