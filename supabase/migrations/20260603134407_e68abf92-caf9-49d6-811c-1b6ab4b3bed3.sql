
-- 1) intent column on telegram_links
ALTER TABLE public.telegram_links ADD COLUMN IF NOT EXISTS intent TEXT;

-- Drop legacy unique on telegram_id alone if it exists
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.telegram_links'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(telegram_id)%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%intent%'
  LOOP
    EXECUTE format('ALTER TABLE public.telegram_links DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_tg_intent_uniq
  ON public.telegram_links (telegram_id, (COALESCE(intent,'candidate')));

-- 2) handle_new_user: auto-admin for superadmin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_intent TEXT := COALESCE(NEW.raw_user_meta_data->>'intent','candidate');
  v_via    TEXT := COALESCE(NEW.raw_user_meta_data->>'registered_via','email');
  v_tg_id  BIGINT := NULLIF(NEW.raw_user_meta_data->>'telegram_id','')::BIGINT;
  v_is_admin BOOLEAN := (
    lower(COALESCE(NEW.email,'')) = 'shishkarnem@gmail.com'
    OR v_tg_id = 169262990
  );
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email, registered_via, telegram_id, telegram_username, google_email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    v_via::public.registration_method,
    v_tg_id,
    NEW.raw_user_meta_data->>'telegram_username',
    CASE WHEN v_via='google' THEN NEW.email ELSE NULL END
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
END $function$;

-- 3) Trigger to grant admin when superadmin telegram is linked later
CREATE OR REPLACE FUNCTION public.grant_admin_on_tg_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.telegram_id = 169262990 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grant_admin_on_tg_link ON public.telegram_links;
CREATE TRIGGER trg_grant_admin_on_tg_link
AFTER INSERT ON public.telegram_links
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_on_tg_link();

-- 4) Backfill: if superadmin already registered, grant admin now
DO $$
DECLARE u_id uuid;
BEGIN
  FOR u_id IN
    SELECT id FROM auth.users
    WHERE lower(COALESCE(email,'')) = 'shishkarnem@gmail.com'
       OR (raw_user_meta_data->>'telegram_id') = '169262990'
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (u_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
