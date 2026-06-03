CREATE TABLE public.oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  intent TEXT NOT NULL,
  ref TEXT,
  redirect_to TEXT,
  provider TEXT NOT NULL DEFAULT 'telegram',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_oauth_states_created_at ON public.oauth_states (created_at);