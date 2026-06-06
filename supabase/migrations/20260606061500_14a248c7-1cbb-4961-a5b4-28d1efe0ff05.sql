
CREATE OR REPLACE FUNCTION public.candidate_email_login(_email text, _password text, _project uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_email text := lower(trim(_email));
  v_cand public.candidates;
  v_token uuid;
  v_apps jsonb;
BEGIN
  IF v_email IS NULL OR _password IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  IF _project IS NOT NULL THEN
    SELECT * INTO v_cand FROM public.candidates
      WHERE lower(email) = v_email AND project_id = _project LIMIT 1;
  ELSE
    SELECT * INTO v_cand FROM public.candidates
      WHERE lower(email) = v_email
      ORDER BY COALESCE(last_login_at, created_at) DESC LIMIT 1;
  END IF;

  IF v_cand.id IS NULL OR v_cand.password_hash IS NULL
     OR v_cand.password_hash <> extensions.crypt(_password, v_cand.password_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  UPDATE public.candidates SET last_login_at = now() WHERE id = v_cand.id;
  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'candidate_id', c.id,
    'public_id', c.public_id,
    'project_id', c.project_id,
    'company_id', c.company_id,
    'role_name', c.role_name,
    'company_name', co.name,
    'company_slug', co.slug,
    'current_stage', c.current_stage,
    'created_at', c.created_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v_apps
  FROM public.candidates c
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE lower(c.email) = v_email;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', v_cand.id,
    'public_id', v_cand.public_id,
    'project_id', v_cand.project_id,
    'company_id', v_cand.company_id,
    'token', v_token,
    'applications', v_apps
  );
END $function$;

CREATE OR REPLACE FUNCTION public.candidate_email_signup(_email text, _password text, _project uuid, _company uuid DEFAULT NULL::uuid, _phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_email text := lower(trim(_email));
  v_role  text;
  v_company uuid := _company;
  v_existing public.candidates;
  v_cand public.candidates;
  v_token uuid;
  v_hash text;
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

  SELECT role_name, company_id INTO v_role, v_company
    FROM public.projects WHERE id = _project;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF _company IS NOT NULL THEN v_company := _company; END IF;

  SELECT * INTO v_existing FROM public.candidates
    WHERE lower(email) = v_email AND project_id = _project
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.password_hash IS NULL OR v_existing.password_hash <> extensions.crypt(_password, v_existing.password_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
    UPDATE public.candidates SET last_login_at = now(),
      phone = COALESCE(NULLIF(_phone,''), phone)
      WHERE id = v_existing.id;
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
    IF v_hash <> extensions.crypt(_password, v_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
  ELSE
    v_hash := extensions.crypt(_password, extensions.gen_salt('bf'));
  END IF;

  INSERT INTO public.candidates (
    email, password_hash, project_id, company_id,
    role_name, registered_via, current_stage, auth_kind, phone
  ) VALUES (
    v_email, v_hash, _project, v_company, v_role,
    'email'::public.registration_method,
    'terms'::public.candidate_stage,
    'email', NULLIF(_phone,'')
  ) RETURNING * INTO v_cand;

  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  RETURN jsonb_build_object('ok', true, 'candidate_id', v_cand.id,
    'public_id', v_cand.public_id, 'project_id', v_cand.project_id,
    'company_id', v_cand.company_id, 'token', v_token);
END $function$;
