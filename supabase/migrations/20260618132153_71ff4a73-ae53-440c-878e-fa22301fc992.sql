-- Phase 3B-1 gate hardening: diagnostics columns on ai_job_attempts, stricter
-- start_ai_job_attempt RPC (refuses terminal jobs and fallback while primary
-- is active), and an idempotent debit RPC keyed by ai_job + charge_kind.

-- 1. Diagnostics columns. http_status / chat_id / operation_part / validation_ok
--    / response_meta — none contain raw prompts, full AI text, secrets or PII.
ALTER TABLE public.ai_job_attempts
  ADD COLUMN IF NOT EXISTS chat_id text,
  ADD COLUMN IF NOT EXISTS operation_part text,
  ADD COLUMN IF NOT EXISTS http_status int,
  ADD COLUMN IF NOT EXISTS validation_ok boolean,
  ADD COLUMN IF NOT EXISTS response_meta jsonb;

-- 2. Harden start_ai_job_attempt — three rules added beyond the existing
--    FOR UPDATE lock + "no second active attempt of same provider":
--      (a) refuse if the job already reached a TERMINAL status,
--      (b) refuse fallback while a primary attempt is still active,
--      (c) refuse primary after a previous primary terminally succeeded.
CREATE OR REPLACE FUNCTION public.start_ai_job_attempt(
  _job_id uuid,
  _provider public.ai_job_provider
)
RETURNS TABLE (attempt_id uuid, attempt_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_active_same int;
  v_active_primary int;
  v_next int;
  v_id uuid;
BEGIN
  SELECT status INTO v_status FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ai_job_not_found';
  END IF;

  IF v_status IN (
    'primary_succeeded','fallback_succeeded','cancelled',
    'timed_out','save_failed','validation_failed','fallback_failed'
  ) THEN
    RAISE EXCEPTION 'job_terminal:%', v_status;
  END IF;

  SELECT count(*) INTO v_active_same
  FROM public.ai_job_attempts
  WHERE job_id = _job_id AND provider = _provider AND status = 'started';
  IF v_active_same > 0 THEN
    RAISE EXCEPTION 'attempt_already_active';
  END IF;

  IF _provider <> 'primary' THEN
    SELECT count(*) INTO v_active_primary
    FROM public.ai_job_attempts
    WHERE job_id = _job_id AND provider = 'primary' AND status = 'started';
    IF v_active_primary > 0 THEN
      RAISE EXCEPTION 'primary_still_active';
    END IF;
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next
  FROM public.ai_job_attempts
  WHERE job_id = _job_id;

  INSERT INTO public.ai_job_attempts (job_id, provider, attempt_number, status)
  VALUES (_job_id, _provider, v_next, 'started')
  RETURNING id INTO v_id;

  attempt_id := v_id;
  attempt_number := v_next;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) TO service_role;

-- 3. Idempotent debit RPC layered on top of spend_pack. Keyed by ai_job:job_id:kind.
--    The underlying spend_pack already enforces single-debit per candidate via
--    idem_key `pack:interview:{candidate_id}` — this wrapper records the
--    job/kind binding and returns the cached outcome on repeat.
CREATE TABLE IF NOT EXISTS public.ai_job_debits (
  job_id uuid NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  charge_kind text NOT NULL,
  outcome jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, charge_kind)
);

GRANT SELECT ON public.ai_job_debits TO authenticated;
GRANT ALL ON public.ai_job_debits TO service_role;

ALTER TABLE public.ai_job_debits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_job_debits_owner_select ON public.ai_job_debits;
CREATE POLICY ai_job_debits_owner_select ON public.ai_job_debits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_jobs j
      WHERE j.id = ai_job_debits.job_id AND j.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.debit_ai_job_once(
  _job_id uuid,
  _candidate uuid,
  _charge_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_outcome jsonb;
BEGIN
  IF _charge_kind NOT IN ('resume_screen','checklist_grade','situations_grade') THEN
    RAISE EXCEPTION 'bad_charge_kind';
  END IF;

  -- Lock the job row so concurrent debits for the same job serialize.
  PERFORM 1 FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_job_not_found'; END IF;

  SELECT outcome INTO v_existing
  FROM public.ai_job_debits
  WHERE job_id = _job_id AND charge_kind = _charge_kind;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'outcome', v_existing);
  END IF;

  v_outcome := public.spend_pack(_candidate, 'interview');

  INSERT INTO public.ai_job_debits (job_id, charge_kind, outcome)
  VALUES (_job_id, _charge_kind, v_outcome)
  ON CONFLICT (job_id, charge_kind) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'already', false, 'outcome', v_outcome);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.debit_ai_job_once(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_ai_job_once(uuid, uuid, text) TO service_role;