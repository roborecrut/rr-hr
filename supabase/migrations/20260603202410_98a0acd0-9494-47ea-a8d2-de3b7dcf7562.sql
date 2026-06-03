
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_first_name text,
  ADD COLUMN IF NOT EXISTS telegram_last_name text,
  ADD COLUMN IF NOT EXISTS telegram_photo_url text,
  ADD COLUMN IF NOT EXISTS telegram_phone text;

-- Make referrals.used_by_user_id idempotent for referee
CREATE UNIQUE INDEX IF NOT EXISTS referrals_used_by_uidx ON public.referrals(used_by_user_id) WHERE used_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_referral_bonus(_referrer_public_id text, _new_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref_user uuid;
  v_ref_emp uuid;
  v_new_emp uuid;
BEGIN
  IF _referrer_public_id IS NULL OR _referrer_public_id = '' OR _new_user IS NULL THEN RETURN; END IF;

  SELECT id, user_id INTO v_ref_emp, v_ref_user
    FROM public.employers WHERE public_id = _referrer_public_id LIMIT 1;
  IF v_ref_emp IS NULL OR v_ref_user IS NULL OR v_ref_user = _new_user THEN RETURN; END IF;

  SELECT id INTO v_new_emp FROM public.employers WHERE user_id = _new_user LIMIT 1;
  IF v_new_emp IS NULL THEN RETURN; END IF;  -- only employer→employer referrals get RR

  -- Idempotency: skip if already recorded for this referee
  IF EXISTS (SELECT 1 FROM public.referrals WHERE used_by_user_id = _new_user) THEN RETURN; END IF;

  INSERT INTO public.referrals (ref_code, owner_user_id, used_by_user_id, reward_rr, redeemed_at)
    VALUES (_referrer_public_id, v_ref_user, _new_user, 1000, now());

  PERFORM public.apply_transaction(v_ref_emp, 'bonus'::public.tx_type, 1000, 'referrals', NULL, 'Referral bonus: invited ' || _new_user::text);
  PERFORM public.apply_transaction(v_new_emp, 'bonus'::public.tx_type, 1000, 'referrals', NULL, 'Referral bonus: joined via ' || _referrer_public_id);
END $$;

GRANT EXECUTE ON FUNCTION public.apply_referral_bonus(text, uuid) TO service_role;
