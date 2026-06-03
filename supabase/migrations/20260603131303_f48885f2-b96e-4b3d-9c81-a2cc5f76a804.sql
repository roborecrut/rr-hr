
-- ============ WALLETS ============
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL UNIQUE REFERENCES public.employers(id) ON DELETE CASCADE,
  balance_rr NUMERIC(14,2) NOT NULL DEFAULT 0,
  hold_rr NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet owner select" ON public.wallets FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type public.tx_type NOT NULL,
  amount_rr NUMERIC(14,2) NOT NULL,
  ref_table TEXT,
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx owner select" ON public.transactions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.wallets w JOIN public.employers e ON e.id = w.employer_id WHERE w.id = wallet_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE INDEX idx_tx_wallet ON public.transactions(wallet_id, created_at DESC);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'pending',
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay owner select" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE TRIGGER trg_pay_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pay_emp ON public.payments(employer_id, created_at DESC);

-- ============ APPLY TX RPC ============
CREATE OR REPLACE FUNCTION public.apply_transaction(
  _employer UUID, _type public.tx_type, _amount NUMERIC, _ref_table TEXT DEFAULT NULL, _ref_id UUID DEFAULT NULL, _note TEXT DEFAULT NULL
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet public.wallets;
  v_tx public.transactions;
  v_delta NUMERIC;
BEGIN
  -- ensure wallet
  INSERT INTO public.wallets (employer_id) VALUES (_employer) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = _employer FOR UPDATE;

  v_delta := CASE WHEN _type IN ('topup','bonus','refund') THEN _amount ELSE -_amount END;
  IF v_wallet.balance_rr + v_delta < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  UPDATE public.wallets SET balance_rr = balance_rr + v_delta WHERE id = v_wallet.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, _type, _amount, _ref_table, _ref_id, _note)
  RETURNING * INTO v_tx;

  RETURN v_tx;
END $$;
REVOKE ALL ON FUNCTION public.apply_transaction(uuid, public.tx_type, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transaction(uuid, public.tx_type, numeric, text, uuid, text) TO service_role;

-- ============ EMPLOYER BONUS TRIGGER (1000 RR при создании) ============
CREATE OR REPLACE FUNCTION public.grant_employer_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (NEW.id) ON CONFLICT (employer_id) DO NOTHING;
  IF NOT NEW.bonus_granted THEN
    PERFORM public.apply_transaction(NEW.id, 'bonus'::public.tx_type, 1000, 'employers', NEW.id, 'Signup bonus');
    UPDATE public.employers SET bonus_granted = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.grant_employer_bonus() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_employer_bonus ON public.employers;
CREATE TRIGGER trg_employer_bonus
  AFTER INSERT ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.grant_employer_bonus();
