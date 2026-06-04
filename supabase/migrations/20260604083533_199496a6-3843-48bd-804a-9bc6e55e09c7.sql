-- 1. Восстановить trigger на auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Обновить handle_new_user: НЕ назначать роль когда intent отсутствует — finalize-flow сам её добавит
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_intent_raw TEXT := NULLIF(NEW.raw_user_meta_data->>'intent','');
  v_intent TEXT := v_intent_raw;  -- may be NULL for OAuth users where intent didn't propagate
  v_via    TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'registered_via',''),'email');
  v_tg_id  BIGINT := NULLIF(NEW.raw_user_meta_data->>'telegram_id','')::BIGINT;
  v_is_admin BOOLEAN := (
    lower(COALESCE(NEW.email,'')) = 'shishkarnem@gmail.com'
    OR v_tg_id = 169262990
  );
  v_kinds TEXT[] := CASE WHEN v_intent IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_intent]::text[] END;
BEGIN
  INSERT INTO public.profiles (
    id, display_name, avatar_url, email, registered_via,
    telegram_id, telegram_username, google_email,
    account_kinds, last_signup_intent
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email,
    v_via::public.registration_method,
    v_tg_id,
    NEW.raw_user_meta_data->>'telegram_username',
    CASE WHEN v_via='google' THEN NEW.email ELSE NULL END,
    v_kinds,
    v_intent
  )
  ON CONFLICT (id) DO NOTHING;

  -- Назначаем роль ТОЛЬКО если intent явно известен. Иначе finalize назначит её сам.
  IF v_intent IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, CASE WHEN v_intent='employer' THEN 'employer'::public.app_role ELSE 'candidate'::public.app_role END)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;

-- 3. Подключаем trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Repair: убрать кандидатскую роль/добавить employer для админа, если он на самом деле работодатель
-- (только если у него уже нет employer-роли и нет candidate-записи)
DO $$
DECLARE
  v_uid uuid := '5b50a442-099a-42ac-b3f3-609a2234bf27';
  v_has_emp bool;
  v_has_cand bool;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.candidates WHERE user_id = v_uid) INTO v_has_cand;
  SELECT EXISTS(SELECT 1 FROM public.employers WHERE user_id = v_uid) INTO v_has_emp;
  IF NOT v_has_cand THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'candidate'::public.app_role;
  END IF;
  IF NOT v_has_emp THEN
    INSERT INTO public.employers (user_id, contact_email)
    SELECT v_uid, u.email FROM auth.users u WHERE u.id = v_uid
    ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'employer'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.profiles
     SET account_kinds = ARRAY['employer']::text[],
         last_signup_intent = 'employer'
   WHERE id = v_uid;
END $$;