
CREATE OR REPLACE FUNCTION public.get_my_referrer()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid; v_res jsonb;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'public_id', e.public_id,
    'contact_phone', e.contact_phone,
    'contact_telegram', e.contact_telegram,
    'name', p.display_name,
    'email', p.email,
    'created_at', r.created_at,
    'bonus_rr', r.bonus_units
  )
  INTO v_res
  FROM public.referrals_emp r
  JOIN public.employers e ON e.id = r.referrer_employer_id
  LEFT JOIN public.profiles p ON p.id = e.user_id
  WHERE r.referred_employer_id = v_emp
  LIMIT 1;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.get_my_referrer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referrer() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_referees()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid; v_res jsonb;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'public_id', e.public_id,
    'contact_phone', e.contact_phone,
    'contact_telegram', e.contact_telegram,
    'name', p.display_name,
    'email', p.email,
    'created_at', r.created_at,
    'bonus_rr', r.bonus_units
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_res
  FROM public.referrals_emp r
  JOIN public.employers e ON e.id = r.referred_employer_id
  LEFT JOIN public.profiles p ON p.id = e.user_id
  WHERE r.referrer_employer_id = v_emp;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.get_my_referees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referees() TO authenticated, service_role;
