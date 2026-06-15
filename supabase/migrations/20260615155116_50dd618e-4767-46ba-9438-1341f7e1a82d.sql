CREATE OR REPLACE FUNCTION public.begin_ai_fallback(_job_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job   public.ai_jobs;
  v_role  text := current_setting('request.jwt.claim.role', true);
  v_caller uuid := auth.uid();
  v_existing public.ai_job_attempts;
  v_next_n int;
  v_attempt_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL OR v_caller IS DISTINCT FROM v_job.user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_job.fallback_allowed THEN
    RAISE EXCEPTION 'fallback_not_allowed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_job.fallback_used THEN
    SELECT * INTO v_existing
      FROM public.ai_job_attempts
      WHERE job_id = _job_id AND provider = 'rr_pro_max'
      ORDER BY attempt_number DESC LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'attempt_id', v_existing.id,
      'attempt_status', v_existing.status,
      'job_status', v_job.status
    );
  END IF;
  IF v_job.status <> 'primary_failed' AND v_job.status <> 'fallback_available' THEN
    RAISE EXCEPTION 'illegal_state_for_fallback' USING ERRCODE = 'check_violation';
  END IF;

  -- Атомарный двух-шаговый переход внутри одной транзакции:
  -- primary_failed → fallback_available, затем fallback_available → fallback_restarting.
  -- Каждый UPDATE отдельно вызывает страж-триггер, поэтому запрещённый
  -- прямой переход primary_failed → fallback_restarting не используется,
  -- а другие запреты (terminal/primary_succeeded/fallback_used reset) сохранены.
  IF v_job.status = 'primary_failed' THEN
    UPDATE public.ai_jobs SET status = 'fallback_available', updated_at = now()
      WHERE id = _job_id;
  END IF;

  UPDATE public.ai_jobs
     SET fallback_used = true,
         status = 'fallback_restarting',
         updated_at = now()
   WHERE id = _job_id;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_n
    FROM public.ai_job_attempts
   WHERE job_id = _job_id AND provider = 'rr_pro_max';

  INSERT INTO public.ai_job_attempts (job_id, provider, attempt_number, status)
  VALUES (_job_id, 'rr_pro_max', v_next_n, 'started')
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'attempt_id', v_attempt_id,
    'attempt_number', v_next_n
  );
END $function$;