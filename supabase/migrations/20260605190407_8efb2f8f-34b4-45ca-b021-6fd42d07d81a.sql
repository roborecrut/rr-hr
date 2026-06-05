
-- 1) Fix mutable search_path on pack_tier_price
CREATE OR REPLACE FUNCTION public.pack_tier_price(_qty integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _qty <= 9    THEN 200
    WHEN _qty <= 49   THEN 150
    WHEN _qty <= 199  THEN 100
    ELSE 50
  END
$function$;

-- 2) logs: admin-only access
CREATE POLICY "Admins can read logs" ON public.logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) rate_limits: admin-only read
CREATE POLICY "Admins can read rate_limits" ON public.rate_limits
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) candidate_sessions: explicit deny for anon/authenticated (service_role still ALL)
CREATE POLICY "Deny anon access to candidate_sessions"
  ON public.candidate_sessions AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 5) referrals_emp: explicit restrictive policy preventing client-side writes
CREATE POLICY "Only service_role can write referrals"
  ON public.referrals_emp AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Only service_role can update referrals"
  ON public.referrals_emp AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Only service_role can delete referrals"
  ON public.referrals_emp AS RESTRICTIVE
  FOR DELETE TO anon, authenticated
  USING (false);

-- 6) client_errors: replace permissive WITH CHECK (true) with bounded check
DROP POLICY IF EXISTS "anyone can insert client errors" ON public.client_errors;
CREATE POLICY "Anyone can insert bounded client errors"
  ON public.client_errors
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    message IS NOT NULL
    AND char_length(message) BETWEEN 1 AND 4000
    AND (source IS NULL OR char_length(source) <= 200)
  );
