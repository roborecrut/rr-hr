
-- 1. profiles: add account_kinds + last_signup_intent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_kinds text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_signup_intent text;

-- 2. candidates: add referrer_employer_id + unique (user_id, project_id)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS referrer_employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_user_project_uidx
  ON public.candidates(user_id, project_id)
  WHERE user_id IS NOT NULL AND project_id IS NOT NULL;

-- 3. oauth_states: add vacancy context
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS company_slug text,
  ADD COLUMN IF NOT EXISTS project_slug text,
  ADD COLUMN IF NOT EXISTS project_id uuid;

-- 4. Расширить log_telegram_event для всех kind, которые пишет код
CREATE OR REPLACE FUNCTION public.log_telegram_event(
  _kind text,
  _source text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _intent text DEFAULT NULL,
  _host text DEFAULT NULL,
  _path text DEFAULT NULL,
  _next_path text DEFAULT NULL,
  _vacancy_count integer DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _kind NOT IN (
    'route_decision','next_reject','whitelist_reject',
    'rate_limited','turnstile_fail','start_failed','miniapp_failed',
    'miniapp_no_init_data','callback_failed'
  ) THEN
    RAISE EXCEPTION 'forbidden_kind';
  END IF;
  IF length(coalesce(_path,'')) > 512 OR length(coalesce(_next_path,'')) > 1024 THEN
    RAISE EXCEPTION 'path_too_long';
  END IF;
  INSERT INTO public.telegram_events(kind, source, reason, intent, host, path, next_path, vacancy_count, meta)
  VALUES (_kind, _source, _reason, _intent, _host, _path, _next_path, _vacancy_count, coalesce(_meta,'{}'::jsonb));
END $$;

-- 5. handle_new_user: заполняем account_kinds и last_signup_intent
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_intent TEXT := COALESCE(NEW.raw_user_meta_data->>'intent','candidate');
  v_via    TEXT := COALESCE(NEW.raw_user_meta_data->>'registered_via','email');
  v_tg_id  BIGINT := NULLIF(NEW.raw_user_meta_data->>'telegram_id','')::BIGINT;
  v_is_admin BOOLEAN := (
    lower(COALESCE(NEW.email,'')) = 'shishkarnem@gmail.com'
    OR v_tg_id = 169262990
  );
  v_kind TEXT := CASE WHEN v_intent='employer' THEN 'employer' ELSE 'candidate' END;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email, registered_via, telegram_id, telegram_username, google_email, account_kinds, last_signup_intent)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    v_via::public.registration_method,
    v_tg_id,
    NEW.raw_user_meta_data->>'telegram_username',
    CASE WHEN v_via='google' THEN NEW.email ELSE NULL END,
    ARRAY[v_kind]::text[],
    v_intent
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_intent='employer' THEN 'employer'::public.app_role ELSE 'candidate'::public.app_role END)
  ON CONFLICT DO NOTHING;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;
