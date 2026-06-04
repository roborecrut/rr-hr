
CREATE TABLE public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  message text NOT NULL,
  user_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read client errors"
  ON public.client_errors
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX client_errors_created_at_idx ON public.client_errors (created_at DESC);
CREATE INDEX client_errors_source_idx ON public.client_errors (source);
