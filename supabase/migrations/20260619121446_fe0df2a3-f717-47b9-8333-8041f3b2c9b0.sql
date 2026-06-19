
CREATE OR REPLACE FUNCTION public.reap_stale_ai_job(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_updated timestamptz;
BEGIN
  SELECT j.status::text, j.updated_at
    INTO v_status, v_updated
    FROM public.ai_jobs j
   WHERE j.id = _job_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_status IN (
    'primary_succeeded','fallback_succeeded','cancelled','timed_out',
    'save_failed','validation_failed','fallback_failed',
    'fallback_unavailable','orchestration_failed'
  ) THEN
    RETURN;
  END IF;
  IF v_updated < now() - interval '8 minutes' THEN
    UPDATE public.ai_jobs
       SET status = 'orchestration_failed',
           completed_at = now(),
           updated_at = now()
     WHERE id = _job_id;
    UPDATE public.ai_job_attempts
       SET status = 'timed_out'::ai_job_attempt_status,
           completed_at = COALESCE(completed_at, now()),
           safe_error_code = COALESCE(safe_error_code, 'worker_killed')
     WHERE job_id = _job_id
       AND status = 'started'::ai_job_attempt_status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reap_stale_ai_job(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ai_job_safe_status(_job_id uuid)
RETURNS TABLE(
  job_id uuid, job_type text, status text, fallback_used boolean,
  attempts_count integer, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_candidate uuid;
  v_user uuid;
  v_caller uuid;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller := auth.uid();
  SELECT j.candidate_id, j.user_id INTO v_candidate, v_user
    FROM public.ai_jobs j WHERE j.id = _job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_job_not_found'; END IF;

  IF v_role <> 'service_role' THEN
    IF v_user IS NOT NULL AND v_user = v_caller THEN
      NULL;
    ELSIF v_candidate IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = v_candidate AND c.user_id = v_caller
    ) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  PERFORM public.reap_stale_ai_job(_job_id);

  RETURN QUERY
    SELECT j.id, j.job_type, j.status::text, j.fallback_used,
      (SELECT COUNT(*)::int FROM public.ai_job_attempts a WHERE a.job_id = j.id),
      j.created_at, j.updated_at, j.completed_at
    FROM public.ai_jobs j WHERE j.id = _job_id;
END;
$$;

UPDATE public.ai_jobs
   SET status = 'orchestration_failed',
       completed_at = now(),
       updated_at = now()
 WHERE status IN ('created','primary_running','fallback_running','primary_failed','fallback_available')
   AND updated_at < now() - interval '3 minutes';

UPDATE public.ai_job_attempts
   SET status = 'timed_out'::ai_job_attempt_status,
       completed_at = COALESCE(completed_at, now()),
       safe_error_code = COALESCE(safe_error_code, 'worker_killed')
 WHERE status = 'started'::ai_job_attempt_status
   AND started_at < now() - interval '3 minutes';
