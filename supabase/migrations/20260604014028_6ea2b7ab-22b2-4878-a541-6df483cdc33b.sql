-- Grant required table privileges so RLS policies actually take effect.
-- Without these GRANTs PostgREST returns "permission denied" (a.k.a. "forbidden")
-- before the policy check runs.

GRANT SELECT ON public.client_errors TO authenticated;
GRANT ALL    ON public.client_errors TO service_role;

GRANT SELECT ON public.telegram_events TO authenticated;
GRANT ALL    ON public.telegram_events TO service_role;

-- log-client-error edge function uses the anon key; allow anonymous inserts
-- so the journal can capture browser-side failures. RLS still applies.
GRANT INSERT ON public.client_errors TO anon;

-- Make sure there's an INSERT policy for anon (insert-only journal).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.client_errors'::regclass
      AND polname = 'anyone can insert client errors'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "anyone can insert client errors"
        ON public.client_errors
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (true)
    $p$;
  END IF;
END $$;