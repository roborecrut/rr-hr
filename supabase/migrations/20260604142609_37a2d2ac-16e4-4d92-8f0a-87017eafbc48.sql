CREATE TABLE IF NOT EXISTS public.referrals_emp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  referred_employer_id uuid NOT NULL UNIQUE REFERENCES public.employers(id) ON DELETE CASCADE,
  bonus_units integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referrals_emp TO authenticated;
GRANT ALL ON public.referrals_emp TO service_role;

ALTER TABLE public.referrals_emp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employer sees own referrals"
ON public.referrals_emp FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employers e
    WHERE e.id = referrals_emp.referrer_employer_id AND e.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.employers e
    WHERE e.id = referrals_emp.referred_employer_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE INDEX idx_referrals_emp_referrer ON public.referrals_emp(referrer_employer_id);