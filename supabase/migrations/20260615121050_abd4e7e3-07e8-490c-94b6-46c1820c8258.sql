-- RR Pro Max stage 4a: server-side AI job queue foundation.
-- Two private tables track the lifecycle of a single billable AI task and
-- its provider attempts (primary + optional fallback). RLS prevents cross-
-- tenant reads; service role (edge functions) is the only writer.

-- ─── ENUMS ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.ai_job_status AS ENUM (
    'created',
    'primary_running',
    'primary_succeeded',
    'primary_failed',
    'fallback_available',
    'fallback_restarting',
    'fallback_running',
    'fallback_succeeded',
    'fallback_failed',
    'cancelled',
    'timed_out',
    'save_failed',
    'validation_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_job_provider AS ENUM ('primary', 'rr_pro_max');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_job_attempt_status AS ENUM (
    'started', 'succeeded', 'failed', 'timed_out', 'cancelled', 'validation_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_job_credits_status AS ENUM (
    'not_charged', 'charged', 'refunded', 'charge_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── ai_jobs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  vacancy_id uuid,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  status public.ai_job_status NOT NULL DEFAULT 'created',
  primary_provider public.ai_job_provider NOT NULL DEFAULT 'primary',
  fallback_allowed boolean NOT NULL DEFAULT true,
  fallback_used boolean NOT NULL DEFAULT false,
  request_hash text,
  idempotency_key text NOT NULL,
  prompt_version text,
  expected_schema text,
  -- Private. Never returned to non-service callers. May contain user prompt
  -- and per-job input data. MUST NOT contain API keys, bot tokens, signed
  -- secrets or Authorization headers.
  request_snapshot jsonb,
  result_reference jsonb,
  credits_status public.ai_job_credits_status NOT NULL DEFAULT 'not_charged',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz
);

-- One ai_job per (user_id, idempotency_key). Repeated submissions with the
-- same key from the same user MUST return the existing row, never create a
-- duplicate paid task.
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_user_idem_uq
  ON public.ai_jobs (user_id, idempotency_key);
-- For candidate-driven flows (no auth.uid) we scope by candidate_id instead.
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_candidate_idem_uq
  ON public.ai_jobs (candidate_id, idempotency_key)
  WHERE candidate_id IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS ai_jobs_employer_idx ON public.ai_jobs (employer_id);
CREATE INDEX IF NOT EXISTS ai_jobs_candidate_idx ON public.ai_jobs (candidate_id);
CREATE INDEX IF NOT EXISTS ai_jobs_status_idx ON public.ai_jobs (status);

-- ─── ai_job_attempts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  provider public.ai_job_provider NOT NULL,
  attempt_number int NOT NULL,
  status public.ai_job_attempt_status NOT NULL DEFAULT 'started',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  -- Short safe code only, e.g. `provider_timeout`, `validation_failed`,
  -- `auth_failed`. NEVER raw provider error bodies.
  safe_error_code text,
  response_validation_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Per job: only one in-flight attempt per provider at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ai_job_attempts_inflight_uq
  ON public.ai_job_attempts (job_id, provider)
  WHERE status = 'started';
CREATE UNIQUE INDEX IF NOT EXISTS ai_job_attempts_number_uq
  ON public.ai_job_attempts (job_id, provider, attempt_number);
CREATE INDEX IF NOT EXISTS ai_job_attempts_job_idx ON public.ai_job_attempts (job_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_ai_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_jobs_set_updated_at ON public.ai_jobs;
CREATE TRIGGER ai_jobs_set_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_jobs_set_updated_at();

-- ─── Safe public-status view (no snapshot, no internal codes) ───────────
CREATE OR REPLACE VIEW public.ai_jobs_safe_status AS
  SELECT
    id,
    job_type,
    user_id,
    employer_id,
    candidate_id,
    project_id,
    status,
    fallback_allowed,
    fallback_used,
    credits_status,
    created_at,
    updated_at,
    completed_at
  FROM public.ai_jobs;

-- ─── GRANTS ──────────────────────────────────────────────────────────────
-- Direct table access is service-role only. Authenticated users read status
-- through the safe view; anon role gets no access.
GRANT ALL ON public.ai_jobs TO service_role;
GRANT ALL ON public.ai_job_attempts TO service_role;
GRANT SELECT ON public.ai_jobs_safe_status TO authenticated;
GRANT SELECT ON public.ai_jobs_safe_status TO service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_job_attempts ENABLE ROW LEVEL SECURITY;

-- Authenticated employer/admin sees only their own rows. Candidates have no
-- JWT; their flow reads status via an edge function under service role.
DROP POLICY IF EXISTS ai_jobs_owner_select ON public.ai_jobs;
CREATE POLICY ai_jobs_owner_select ON public.ai_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated/anon — service role
-- (edge functions) is the only writer.

DROP POLICY IF EXISTS ai_job_attempts_owner_select ON public.ai_job_attempts;
CREATE POLICY ai_job_attempts_owner_select ON public.ai_job_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_jobs j
      WHERE j.id = ai_job_attempts.job_id AND j.user_id = auth.uid()
    )
  );