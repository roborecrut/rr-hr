
-- Phase 1: additive schema for split employer/candidate reports + atomic AI attempt start.

-- 1. candidate_scores: new JSONB feedback columns + ai_fit_score + overall_generated_at
ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS ai_fit_score numeric,
  ADD COLUMN IF NOT EXISTS employer_overall_feedback jsonb,
  ADD COLUMN IF NOT EXISTS candidate_overall_feedback jsonb,
  ADD COLUMN IF NOT EXISTS candidate_resume_feedback jsonb,
  ADD COLUMN IF NOT EXISTS candidate_checklist_feedback jsonb,
  ADD COLUMN IF NOT EXISTS candidate_situations_feedback jsonb,
  ADD COLUMN IF NOT EXISTS training_employer_feedback jsonb,
  ADD COLUMN IF NOT EXISTS training_candidate_feedback jsonb,
  ADD COLUMN IF NOT EXISTS overall_generated_at timestamptz;

-- 2. candidate_stage_progress: split employer/candidate summaries per stage
ALTER TABLE public.candidate_stage_progress
  ADD COLUMN IF NOT EXISTS employer_summary jsonb,
  ADD COLUMN IF NOT EXISTS candidate_summary jsonb;

-- 3. Atomic RPC to start a new AI job attempt without race / wrong attempt_number.
--    Locks the ai_jobs row, ensures no active attempt of the same provider exists,
--    computes next attempt_number, inserts ai_job_attempts row, returns ids.
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
  v_active_count int;
  v_next int;
  v_id uuid;
BEGIN
  -- Lock the job row to serialize concurrent attempts for the same job.
  PERFORM 1 FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_job_not_found';
  END IF;

  -- Refuse to start a second active attempt of the same provider.
  SELECT count(*) INTO v_active_count
  FROM public.ai_job_attempts
  WHERE job_id = _job_id
    AND provider = _provider
    AND status = 'started';
  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'attempt_already_active';
  END IF;

  -- Next attempt number across all providers for transparency.
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

REVOKE ALL ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_ai_job_attempt(uuid, public.ai_job_provider) TO service_role;
