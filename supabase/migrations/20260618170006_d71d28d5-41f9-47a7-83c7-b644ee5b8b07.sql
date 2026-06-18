-- Phase 3B-2B Step D1a: idempotent candidate stage advance bound to a terminal-success AI job.
-- Only the situations->training transition is in scope for v2 (checklist v1 had no DB stage write).
-- The RPC is generic and refuses to act unless the named job is owned by the candidate AND in
-- terminal success state. Repeat calls after the move return ok+already=true without re-writing.

CREATE OR REPLACE FUNCTION public.advance_candidate_stage_after_ai_job(
  _candidate_id uuid,
  _job_id uuid,
  _expected_current_stage text,
  _next_stage text,
  _job_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_owner uuid;
  v_job_type  text;
  v_job_status text;
  v_current   text;
BEGIN
  IF _candidate_id IS NULL OR _job_id IS NULL OR _next_stage IS NULL OR _job_type IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  -- 1) Verify job ownership + type + terminal success.
  SELECT candidate_id, job_type, status
    INTO v_job_owner, v_job_type, v_job_status
    FROM public.ai_jobs WHERE id = _job_id;
  IF v_job_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;
  IF v_job_owner <> _candidate_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_job_type <> _job_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_type_mismatch');
  END IF;
  IF v_job_status NOT IN ('primary_succeeded', 'fallback_succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_succeeded', 'status', v_job_status);
  END IF;

  -- 2) Lock candidate row and inspect current_stage.
  SELECT current_stage INTO v_current
    FROM public.candidates WHERE id = _candidate_id FOR UPDATE;
  IF v_current IS NULL AND NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'candidate_not_found');
  END IF;

  IF v_current IS NOT DISTINCT FROM _next_stage THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_stage', v_current);
  END IF;

  IF _expected_current_stage IS NOT NULL
     AND v_current IS DISTINCT FROM _expected_current_stage THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'stage_conflict',
      'current_stage', v_current, 'expected', _expected_current_stage
    );
  END IF;

  UPDATE public.candidates
     SET current_stage = _next_stage
   WHERE id = _candidate_id;

  RETURN jsonb_build_object('ok', true, 'advanced', true, 'current_stage', _next_stage);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job(uuid,uuid,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job(uuid,uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job(uuid,uuid,text,text,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job(uuid,uuid,text,text,text) TO service_role;