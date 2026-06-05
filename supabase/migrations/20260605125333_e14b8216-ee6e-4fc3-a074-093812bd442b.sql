
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Extend candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_kind text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_unique
  ON public.candidates (lower(email))
  WHERE email IS NOT NULL;

-- Hide password_hash from client roles
REVOKE SELECT (password_hash) ON public.candidates FROM anon, authenticated;

-- 2. Sessions table
CREATE TABLE IF NOT EXISTS public.candidate_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

GRANT ALL ON public.candidate_sessions TO service_role;
-- no anon/authenticated grants; access is only through SECURITY DEFINER RPCs

ALTER TABLE public.candidate_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_candidate_sessions"
  ON public.candidate_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Signup RPC
CREATE OR REPLACE FUNCTION public.candidate_email_signup(
  _email text,
  _password text,
  _project uuid,
  _company uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_role  text;
  v_company uuid := _company;
  v_cand public.candidates;
  v_token uuid;
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

  IF EXISTS (SELECT 1 FROM public.candidates WHERE lower(email) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_taken');
  END IF;

  SELECT role_name, company_id INTO v_role, v_company
    FROM public.projects WHERE id = _project;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF _company IS NOT NULL THEN v_company := _company; END IF;

  INSERT INTO public.candidates (
    email, password_hash, project_id, company_id,
    role_name, registered_via, current_stage, auth_kind
  ) VALUES (
    v_email,
    crypt(_password, gen_salt('bf')),
    _project, v_company,
    v_role,
    'email'::public.registration_method,
    'terms'::public.candidate_stage,
    'email'
  ) RETURNING * INTO v_cand;

  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', v_cand.id,
    'public_id', v_cand.public_id,
    'token', v_token
  );
END $$;

-- 4. Login RPC
CREATE OR REPLACE FUNCTION public.candidate_email_login(
  _email text,
  _password text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_cand public.candidates;
  v_token uuid;
BEGIN
  IF v_email IS NULL OR _password IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  SELECT * INTO v_cand FROM public.candidates
    WHERE lower(email) = v_email LIMIT 1;

  IF v_cand.id IS NULL OR v_cand.password_hash IS NULL
     OR v_cand.password_hash <> crypt(_password, v_cand.password_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  UPDATE public.candidates SET last_login_at = now() WHERE id = v_cand.id;
  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', v_cand.id,
    'public_id', v_cand.public_id,
    'project_id', v_cand.project_id,
    'company_id', v_cand.company_id,
    'token', v_token
  );
END $$;

GRANT EXECUTE ON FUNCTION public.candidate_email_signup(text, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_email_login(text, text) TO anon, authenticated;

-- 5. Ensure registration_method has 'email'
DO $$ BEGIN
  ALTER TYPE public.registration_method ADD VALUE IF NOT EXISTS 'email';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
