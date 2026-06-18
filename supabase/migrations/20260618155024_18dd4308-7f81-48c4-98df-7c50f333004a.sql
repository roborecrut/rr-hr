-- =============================================================================
-- Phase 3B-2B Step A: stage-specific atomic save RPCs for v2 grading flows.
-- Each RPC writes ONLY its own stage columns. Never touches other stage
-- scores, overall_score, ai_fit_score, employer_overall_feedback, or
-- candidate_overall_feedback. The pre-existing overall_score trigger may
-- recompute overall_score AFTER this commit.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_candidate_checklist_evaluation_v2(
  _candidate uuid,
  _checklist_score int,
  _checklist_feedback jsonb,
  _candidate_checklist_feedback jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _checklist_score IS NULL OR _checklist_score < 0 OR _checklist_score > 100 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  IF _checklist_feedback IS NULL OR jsonb_typeof(_checklist_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_checklist_feedback';
  END IF;
  IF _candidate_checklist_feedback IS NULL OR jsonb_typeof(_candidate_checklist_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_candidate_checklist_feedback';
  END IF;

  v_score := _checklist_score::numeric;

  INSERT INTO public.candidate_scores AS cs (
    candidate_id, checklist_score, checklist_feedback,
    candidate_checklist_feedback, updated_at
  ) VALUES (
    _candidate, v_score, _checklist_feedback,
    _candidate_checklist_feedback, now()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    checklist_score              = EXCLUDED.checklist_score,
    checklist_feedback           = EXCLUDED.checklist_feedback,
    candidate_checklist_feedback = EXCLUDED.candidate_checklist_feedback,
    updated_at                   = now();

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'checklist_score', v_score,
    'updated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_candidate_checklist_evaluation_v2(uuid,int,jsonb,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_candidate_checklist_evaluation_v2(uuid,int,jsonb,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_candidate_checklist_evaluation_v2(uuid,int,jsonb,jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.save_candidate_checklist_evaluation_v2(uuid,int,jsonb,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.save_candidate_situations_evaluation_v2(
  _candidate uuid,
  _situations_score int,
  _situations_feedback jsonb,
  _candidate_situations_feedback jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _situations_score IS NULL OR _situations_score < 0 OR _situations_score > 100 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  IF _situations_feedback IS NULL OR jsonb_typeof(_situations_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_situations_feedback';
  END IF;
  IF _candidate_situations_feedback IS NULL OR jsonb_typeof(_candidate_situations_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_candidate_situations_feedback';
  END IF;

  v_score := _situations_score::numeric;

  INSERT INTO public.candidate_scores AS cs (
    candidate_id, situations_score, situations_feedback,
    candidate_situations_feedback, updated_at
  ) VALUES (
    _candidate, v_score, _situations_feedback,
    _candidate_situations_feedback, now()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    situations_score              = EXCLUDED.situations_score,
    situations_feedback           = EXCLUDED.situations_feedback,
    candidate_situations_feedback = EXCLUDED.candidate_situations_feedback,
    updated_at                    = now();

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'situations_score', v_score,
    'updated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_candidate_situations_evaluation_v2(uuid,int,jsonb,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_candidate_situations_evaluation_v2(uuid,int,jsonb,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_candidate_situations_evaluation_v2(uuid,int,jsonb,jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.save_candidate_situations_evaluation_v2(uuid,int,jsonb,jsonb) TO service_role;
