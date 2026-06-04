
CREATE OR REPLACE FUNCTION public.topup_rr(_amount_rub int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_wallet public.wallets;
BEGIN
  IF _amount_rub IS NULL OR _amount_rub < 100 THEN
    RAISE EXCEPTION 'min_100';
  END IF;
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;
  UPDATE public.wallets SET units_balance = units_balance + _amount_rub, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, 'topup'::public.tx_type, _amount_rub, 'employers', v_emp, 'Пополнение: ' || _amount_rub || ' ₽');

  RETURN jsonb_build_object('ok', true, 'amount', _amount_rub);
END $$;

REVOKE ALL ON FUNCTION public.topup_rr(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topup_rr(int) TO authenticated, service_role;
