
-- 1. Employers: согласие с офертой
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS offer_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_version text;

-- 2. Robokassa payments
CREATE TABLE IF NOT EXISTS public.payments_robokassa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_id bigserial UNIQUE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  amount_rub integer NOT NULL CHECK (amount_rub >= 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  description text,
  offer_accepted boolean NOT NULL DEFAULT true,
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payments_robokassa TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.payments_robokassa_inv_id_seq TO authenticated, service_role;
GRANT ALL ON public.payments_robokassa TO service_role;

ALTER TABLE public.payments_robokassa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emp_own_invoices_select" ON public.payments_robokassa
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = payments_robokassa.employer_id AND e.user_id = auth.uid())
         OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "emp_own_invoices_insert" ON public.payments_robokassa
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = payments_robokassa.employer_id AND e.user_id = auth.uid()));

CREATE TRIGGER tg_payments_robokassa_updated
  BEFORE UPDATE ON public.payments_robokassa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_robokassa_employer ON public.payments_robokassa(employer_id, created_at DESC);

-- 3. RPC: создать счёт
CREATE OR REPLACE FUNCTION public.robokassa_create_invoice(_amount_rub integer, _offer_accepted boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp public.employers;
  v_row public.payments_robokassa;
BEGIN
  IF _amount_rub IS NULL OR _amount_rub < 100 THEN RAISE EXCEPTION 'min_100'; END IF;
  IF _offer_accepted IS NOT TRUE THEN RAISE EXCEPTION 'offer_required'; END IF;

  SELECT * INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  UPDATE public.employers
     SET offer_accepted = true,
         offer_accepted_at = COALESCE(offer_accepted_at, now()),
         offer_version = COALESCE(offer_version, '2026-06-06')
   WHERE id = v_emp.id;

  INSERT INTO public.payments_robokassa(employer_id, amount_rub, description, offer_accepted)
  VALUES (v_emp.id, _amount_rub, 'Пополнение баланса RR на ' || _amount_rub || ' RR', true)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'inv_id', v_row.inv_id, 'amount_rub', v_row.amount_rub);
END $$;

GRANT EXECUTE ON FUNCTION public.robokassa_create_invoice(integer, boolean) TO authenticated;

-- 4. RPC: пометить оплаченным (для edge-функции)
CREATE OR REPLACE FUNCTION public.robokassa_mark_paid(_inv_id bigint, _amount numeric, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.payments_robokassa;
  v_idem text;
BEGIN
  SELECT * INTO v_row FROM public.payments_robokassa WHERE inv_id = _inv_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'no_invoice'; END IF;

  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF abs(v_row.amount_rub - _amount) > 0.01 THEN
    UPDATE public.payments_robokassa SET status = 'failed', raw_payload = _payload WHERE id = v_row.id;
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  v_idem := 'robokassa:' || _inv_id::text;
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    INSERT INTO public.wallets(employer_id) VALUES (v_row.employer_id) ON CONFLICT (employer_id) DO NOTHING;
    UPDATE public.wallets SET units_balance = units_balance + v_row.amount_rub, updated_at = now()
      WHERE employer_id = v_row.employer_id;
    INSERT INTO public.transactions(wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
    SELECT w.id, 'topup'::public.tx_type, v_row.amount_rub, 'payments_robokassa', v_row.id,
           'Пополнение через Робокассу: ' || v_row.amount_rub || ' ₽', v_idem
      FROM public.wallets w WHERE w.employer_id = v_row.employer_id;
  END IF;

  UPDATE public.payments_robokassa
     SET status = 'paid', paid_at = now(), raw_payload = _payload
   WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'inv_id', _inv_id, 'amount', v_row.amount_rub);
END $$;

REVOKE ALL ON FUNCTION public.robokassa_mark_paid(bigint, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.robokassa_mark_paid(bigint, numeric, jsonb) TO service_role;
