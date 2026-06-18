-- 1) Add new terminal status used when we cannot even start a primary attempt.
ALTER TYPE public.ai_job_status ADD VALUE IF NOT EXISTS 'orchestration_failed';

-- 2) Rewrite start_ai_job_attempt with fully qualified column references
--    to eliminate the ambiguity between OUT parameter `attempt_number`
--    and column `ai_job_attempts.attempt_number` (Postgres error 42702).
CREATE OR REPLACE FUNCTION public.start_ai_job_attempt(
  _job_id uuid,
  _provider public.ai_job_provider
)
RETURNS TABLE(attempt_id uuid, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_status         text;
  v_active_same    int;
  v_active_primary int;
  v_next_number    int;
  v_new_id         uuid;
BEGIN
  SELECT j.status
    INTO v_status
    FROM public.ai_jobs AS j
   WHERE j.id = _job_id
     FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ai_job_not_found';
  END IF;

  IF v_status IN (
    'primary_succeeded','fallback_succeeded','cancelled',
    'timed_out','save_failed','validation_failed','fallback_failed',
    'orchestration_failed'
  ) THEN
    RAISE EXCEPTION 'job_terminal:%', v_status;
  END IF;

  SELECT count(*)
    INTO v_active_same
    FROM public.ai_job_attempts AS a
   WHERE a.job_id   = _job_id
     AND a.provider = _provider
     AND a.status   = 'started';
  IF v_active_same > 0 THEN
    RAISE EXCEPTION 'attempt_already_active';
  END IF;

  IF _provider <> 'primary' THEN
    SELECT count(*)
      INTO v_active_primary
      FROM public.ai_job_attempts AS a
     WHERE a.job_id   = _job_id
       AND a.provider = 'primary'
       AND a.status   = 'started';
    IF v_active_primary > 0 THEN
      RAISE EXCEPTION 'primary_still_active';
    END IF;
  END IF;

  SELECT COALESCE(MAX(a.attempt_number), 0) + 1
    INTO v_next_number
    FROM public.ai_job_attempts AS a
   WHERE a.job_id = _job_id;

  INSERT INTO public.ai_job_attempts (job_id, provider, attempt_number, status)
  VALUES (_job_id, _provider, v_next_number, 'started')
  RETURNING ai_job_attempts.id INTO v_new_id;

  attempt_id     := v_new_id;
  attempt_number := v_next_number;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) FROM anon;
REVOKE ALL ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) TO service_role;