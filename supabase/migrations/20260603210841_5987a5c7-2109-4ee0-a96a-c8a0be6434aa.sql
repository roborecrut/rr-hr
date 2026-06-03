
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referee_kind text NOT NULL DEFAULT 'employer',
  ADD COLUMN IF NOT EXISTS intent text;

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referee_kind_chk;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referee_kind_chk CHECK (referee_kind IN ('employer','candidate'));

CREATE UNIQUE INDEX IF NOT EXISTS referrals_used_by_user_id_uniq ON public.referrals(used_by_user_id);

CREATE OR REPLACE FUNCTION public.apply_referral_bonus(_referrer_public_id text, _new_user uuid, _intent text DEFAULT 'employer')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_user uuid;
  v_ref_emp uuid;
  v_new_emp uuid;
  v_kind text;
  v_reward numeric := 0;
BEGIN
  IF _referrer_public_id IS NULL OR _referrer_public_id = '' OR _new_user IS NULL THEN RETURN; END IF;

  SELECT id, user_id INTO v_ref_emp, v_ref_user
    FROM public.employers WHERE public_id = _referrer_public_id LIMIT 1;
  IF v_ref_emp IS NULL OR v_ref_user IS NULL OR v_ref_user = _new_user THEN RETURN; END IF;

  -- Idempotency: skip if already recorded for this referee
  IF EXISTS (SELECT 1 FROM public.referrals WHERE used_by_user_id = _new_user) THEN RETURN; END IF;

  SELECT id INTO v_new_emp FROM public.employers WHERE user_id = _new_user LIMIT 1;

  IF _intent = 'employer' AND v_new_emp IS NOT NULL THEN
    v_kind := 'employer';
    v_reward := 1000;
  ELSE
    v_kind := 'candidate';
    v_reward := 0;
  END IF;

  INSERT INTO public.referrals (ref_code, owner_user_id, used_by_user_id, reward_rr, redeemed_at, referee_kind, intent)
    VALUES (_referrer_public_id, v_ref_user, _new_user, v_reward, now(), v_kind, _intent);

  IF v_kind = 'employer' THEN
    PERFORM public.apply_transaction(v_ref_emp, 'bonus'::public.tx_type, 1000, 'referrals', NULL, 'Referral bonus: invited ' || _new_user::text);
    PERFORM public.apply_transaction(v_new_emp, 'bonus'::public.tx_type, 1000, 'referrals', NULL, 'Referral bonus: joined via ' || _referrer_public_id);
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_referees()
RETURNS TABLE(
  used_by_user_id uuid,
  referee_kind text,
  intent text,
  created_at timestamptz,
  reward_rr numeric,
  display_name text,
  email text,
  google_email text,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  telegram_photo_url text,
  avatar_url text,
  registered_via text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.used_by_user_id, r.referee_kind, r.intent, r.created_at, r.reward_rr,
         p.display_name, p.email, p.google_email,
         p.telegram_username, p.telegram_first_name, p.telegram_last_name,
         p.telegram_photo_url, p.avatar_url, p.registered_via::text
  FROM public.referrals r
  JOIN public.profiles p ON p.id = r.used_by_user_id
  WHERE r.owner_user_id = auth.uid()
  ORDER BY r.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.get_my_referrer()
RETURNS TABLE(
  owner_user_id uuid,
  owner_public_id text,
  ref_code text,
  referee_kind text,
  intent text,
  created_at timestamptz,
  display_name text,
  email text,
  google_email text,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  telegram_photo_url text,
  avatar_url text,
  registered_via text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.owner_user_id,
         (SELECT e.public_id FROM public.employers e WHERE e.user_id = r.owner_user_id LIMIT 1) AS owner_public_id,
         r.ref_code, r.referee_kind, r.intent, r.created_at,
         p.display_name, p.email, p.google_email,
         p.telegram_username, p.telegram_first_name, p.telegram_last_name,
         p.telegram_photo_url, p.avatar_url, p.registered_via::text
  FROM public.referrals r
  JOIN public.profiles p ON p.id = r.owner_user_id
  WHERE r.used_by_user_id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referrer() TO authenticated;
