
-- 1) candidate_scores feedback columns
ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS resume_feedback jsonb,
  ADD COLUMN IF NOT EXISTS checklist_feedback jsonb,
  ADD COLUMN IF NOT EXISTS situations_feedback jsonb;

-- 2) candidate_email_signup: add company_public_id / project_public_id to result
CREATE OR REPLACE FUNCTION public.candidate_email_signup(_email text, _password text, _project uuid, _company uuid DEFAULT NULL::uuid)
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
  v_status public.entity_status;
  v_pub boolean;
  v_company_pub text;
  v_project_pub text;
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

  SELECT role_name, company_id, status, is_published, public_id
    INTO v_role, v_company, v_status, v_pub, v_project_pub
    FROM public.projects WHERE id = _project;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF v_status IS DISTINCT FROM 'active' OR COALESCE(v_pub,false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vacancy_inactive');
  END IF;
  IF _company IS NOT NULL THEN v_company := _company; END IF;

  SELECT public_id INTO v_company_pub FROM public.companies WHERE id = v_company;

  SELECT * INTO v_existing FROM public.candidates
    WHERE lower(email) = v_email AND project_id = _project
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.password_hash IS NULL OR v_existing.password_hash <> extensions.crypt(_password, v_existing.password_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
    UPDATE public.candidates SET last_login_at = now() WHERE id = v_existing.id;
    INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_existing.id)
      RETURNING token INTO v_token;
    RETURN jsonb_build_object('ok', true, 'candidate_id', v_existing.id,
      'public_id', v_existing.public_id, 'project_id', v_existing.project_id,
      'company_id', v_existing.company_id,
      'project_public_id', v_project_pub, 'company_public_id', v_company_pub,
      'token', v_token, 'already', true);
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
    'company_id', v_cand.company_id,
    'project_public_id', v_project_pub, 'company_public_id', v_company_pub,
    'token', v_token);
END $function$;

-- 3) candidate_email_login: add public_ids to applications + top-level
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
  v_proj_pub text;
  v_comp_pub text;
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

  SELECT p.public_id, c.public_id INTO v_proj_pub, v_comp_pub
    FROM public.projects p
    LEFT JOIN public.companies c ON c.id = v_cand.company_id
    WHERE p.id = v_cand.project_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'candidate_id', c.id,
    'public_id', c.public_id,
    'project_id', c.project_id,
    'project_public_id', p.public_id,
    'company_id', c.company_id,
    'company_public_id', co.public_id,
    'role_name', c.role_name,
    'company_name', co.name,
    'company_slug', co.slug,
    'current_stage', c.current_stage,
    'created_at', c.created_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v_apps
  FROM public.candidates c
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects  p  ON p.id  = c.project_id
  WHERE lower(c.email) = v_email;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', v_cand.id,
    'public_id', v_cand.public_id,
    'project_id', v_cand.project_id,
    'project_public_id', v_proj_pub,
    'company_id', v_cand.company_id,
    'company_public_id', v_comp_pub,
    'token', v_token,
    'applications', v_apps
  );
END $function$;

-- 4) can_start_interview RPC
CREATE OR REPLACE FUNCTION public.can_start_interview(_candidate uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp uuid;
  v_user uuid;
  v_idem text := 'pack:interview:' || _candidate::text;
  v_credits int;
  v_units int;
  v_contact jsonb;
BEGIN
  SELECT p.employer_id, c.user_id INTO v_emp, v_user
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = _candidate;
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_candidate');
  END IF;

  -- Already billed for this candidate → free to continue
  IF EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    RETURN jsonb_build_object('ok', true, 'billed', true);
  END IF;

  SELECT interview_credits INTO v_credits FROM public.employers WHERE id = v_emp;
  SELECT units_balance INTO v_units FROM public.wallets WHERE employer_id = v_emp;

  IF COALESCE(v_credits,0) > 0 OR COALESCE(v_units,0) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'credits', COALESCE(v_credits,0), 'units', COALESCE(v_units,0));
  END IF;

  -- Out of funds → return employer contacts
  SELECT jsonb_build_object(
    'name', pr.display_name,
    'email', e.contact_email,
    'phone', e.contact_phone,
    'telegram', e.contact_telegram
  ) INTO v_contact
    FROM public.employers e
    LEFT JOIN public.profiles pr ON pr.id = e.user_id
    WHERE e.id = v_emp;

  RETURN jsonb_build_object('ok', false, 'reason', 'no_funds', 'employer_contacts', v_contact);
END $function$;

GRANT EXECUTE ON FUNCTION public.can_start_interview(uuid) TO authenticated, anon;

-- 5) Storage RLS for candidate-docs bucket (bucket created separately via storage tool)
-- Policies on storage.objects: owner candidate (auth.uid()) can read/write own prefix `{candidate_id}/...`
-- Employer of the project the candidate belongs to can read.
DO $$
BEGIN
  -- Drop and recreate to be idempotent
  DROP POLICY IF EXISTS "candidate_docs_owner_rw" ON storage.objects;
  DROP POLICY IF EXISTS "candidate_docs_employer_read" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "candidate_docs_owner_rw"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'candidate-docs'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid()
        AND (storage.foldername(name))[1] = c.id::text
    )
  )
  WITH CHECK (
    bucket_id = 'candidate-docs'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid()
        AND (storage.foldername(name))[1] = c.id::text
    )
  );

CREATE POLICY "candidate_docs_employer_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'candidate-docs'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.employers e ON e.id = p.employer_id
      WHERE (storage.foldername(name))[1] = c.id::text
        AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
    )
  );
