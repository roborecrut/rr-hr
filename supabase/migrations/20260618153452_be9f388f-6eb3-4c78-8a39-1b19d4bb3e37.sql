CREATE OR REPLACE FUNCTION public.tg_ai_jobs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  IF OLD.fallback_used = true AND NEW.fallback_used = false THEN
    RAISE EXCEPTION 'ai_jobs_guard: fallback_used cannot be reset' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.credits_status = 'charged' AND NEW.credits_status = 'not_charged' THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_status cannot be reset to not_charged' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.credits_idem_key IS NOT NULL AND NEW.credits_idem_key IS DISTINCT FROM OLD.credits_idem_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_idem_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: idempotency_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'created'             THEN ARRAY['primary_running','cancelled','orchestration_failed']
      WHEN 'primary_running'     THEN ARRAY['primary_succeeded','primary_failed','timed_out','cancelled','validation_failed','save_failed','orchestration_failed']
      WHEN 'primary_succeeded'   THEN ARRAY[]::text[]
      WHEN 'primary_failed'      THEN ARRAY['fallback_available','cancelled','orchestration_failed']
      WHEN 'fallback_available'  THEN ARRAY['fallback_restarting','fallback_running','cancelled','orchestration_failed']
      WHEN 'fallback_restarting' THEN ARRAY['fallback_running','fallback_failed','cancelled','timed_out','orchestration_failed']
      WHEN 'fallback_running'    THEN ARRAY['fallback_succeeded','fallback_failed','timed_out','cancelled','validation_failed','save_failed','orchestration_failed']
      WHEN 'fallback_succeeded'  THEN ARRAY[]::text[]
      WHEN 'fallback_failed'     THEN ARRAY[]::text[]
      WHEN 'cancelled'           THEN ARRAY[]::text[]
      WHEN 'timed_out'           THEN ARRAY[]::text[]
      WHEN 'save_failed'         THEN ARRAY[]::text[]
      WHEN 'validation_failed'   THEN ARRAY[]::text[]
      WHEN 'orchestration_failed' THEN ARRAY[]::text[]
      ELSE ARRAY[]::text[]
    END;
    IF NOT (NEW.status::text = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ai_jobs_guard: illegal transition % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $function$;