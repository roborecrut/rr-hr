
DROP FUNCTION IF EXISTS public.get_ai_job_safe_status(uuid);

CREATE OR REPLACE FUNCTION public.save_candidate_resume_evaluation_v2(
  _candidate uuid,
  _resume_score int,
  _resume_feedback jsonb,
  _candidate_resume_feedback jsonb,
  _assessment_summary text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _resume_score IS NULL OR _resume_score < 0 OR _resume_score > 100 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  IF _resume_feedback IS NULL OR jsonb_typeof(_resume_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_resume_feedback';
  END IF;
  IF _candidate_resume_feedback IS NULL OR jsonb_typeof(_candidate_resume_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_candidate_resume_feedback';
  END IF;

  v_score := _resume_score::numeric;

  INSERT INTO public.candidate_scores AS cs (
    candidate_id, resume_score, resume_feedback,
    candidate_resume_feedback, assessment_summary, updated_at
  ) VALUES (
    _candidate, v_score, _resume_feedback,
    _candidate_resume_feedback,
    LEFT(COALESCE(_assessment_summary, ''), 4000), now()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    resume_score              = EXCLUDED.resume_score,
    resume_feedback           = EXCLUDED.resume_feedback,
    candidate_resume_feedback = EXCLUDED.candidate_resume_feedback,
    assessment_summary        = EXCLUDED.assessment_summary,
    updated_at                = now();

  RETURN jsonb_build_object('ok', true, 'candidate_id', _candidate,
                            'resume_score', v_score, 'updated_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_candidate_resume_evaluation_v2(uuid,int,jsonb,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_candidate_resume_evaluation_v2(uuid,int,jsonb,jsonb,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_candidate_resume_evaluation_v2(uuid,int,jsonb,jsonb,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.save_candidate_resume_evaluation_v2(uuid,int,jsonb,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ai_job_safe_status(_job_id uuid)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  status text,
  fallback_used boolean,
  attempts_count int,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
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

  RETURN QUERY
    SELECT j.id, j.job_type, j.status::text, j.fallback_used,
      (SELECT COUNT(*)::int FROM public.ai_job_attempts a WHERE a.job_id = j.id),
      j.created_at, j.updated_at, j.completed_at
    FROM public.ai_jobs j WHERE j.id = _job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_job_safe_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ai_job_safe_status(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_ai_job_safe_status(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ai_job_safe_status(uuid) TO service_role;
