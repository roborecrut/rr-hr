
CREATE OR REPLACE FUNCTION public.candidate_flow_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand uuid := public.current_candidate_id();
  v_proj uuid;
  v_sc record;
  v_passed text[];
  v_cert_count int := 0;
  v_training_done boolean := false;
  v_stage text := 'terms';
  v_saved text;
BEGIN
  IF v_cand IS NULL THEN
    RETURN jsonb_build_object('stage','terms','authorized', false);
  END IF;

  SELECT project_id, current_stage INTO v_proj, v_saved
    FROM public.candidates WHERE id = v_cand;

  SELECT resume_score, checklist_score, situations_score, interview_score, overall_score
    INTO v_sc
    FROM public.candidate_scores WHERE candidate_id = v_cand;

  SELECT COALESCE(array_agg(stage) FILTER (WHERE passed_at IS NOT NULL), ARRAY[]::text[])
    INTO v_passed
    FROM public.candidate_stage_progress WHERE candidate_id = v_cand;

  v_training_done := ('professional' = ANY(v_passed))
                     AND ('product' = ANY(v_passed))
                     AND ('system' = ANY(v_passed));

  SELECT count(*) INTO v_cert_count
    FROM public.certifications WHERE candidate_id = v_cand;

  -- derive canonical stage from real data
  IF v_proj IS NOT NULL THEN v_stage := 'terms'; END IF;
  IF v_sc.resume_score IS NOT NULL
     OR v_sc.checklist_score IS NOT NULL
     OR v_sc.situations_score IS NOT NULL THEN v_stage := 'interview'; END IF;
  IF v_sc.interview_score IS NOT NULL OR v_sc.overall_score IS NOT NULL THEN v_stage := 'scoring'; END IF;
  IF v_training_done THEN v_stage := 'training'; END IF;
  IF v_cert_count > 0 THEN v_stage := 'certified'; END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'stage', v_stage,
    'saved_stage', COALESCE(v_saved,'terms'),
    'terms_done', v_proj IS NOT NULL,
    'interview_started', (v_sc.resume_score IS NOT NULL OR v_sc.checklist_score IS NOT NULL OR v_sc.situations_score IS NOT NULL),
    'scoring_done', (v_sc.overall_score IS NOT NULL OR v_sc.interview_score IS NOT NULL),
    'training_done', v_training_done,
    'training_passed', to_jsonb(v_passed),
    'certified', v_cert_count > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_flow_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_flow_state() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_set_stage(_stage text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand uuid := public.current_candidate_id();
  v_order text[] := ARRAY['terms','interview','scoring','training','certified'];
  v_current text;
  v_idx_new int;
  v_idx_cur int;
BEGIN
  IF v_cand IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _stage IS NULL OR NOT (_stage = ANY(v_order)) THEN
    RAISE EXCEPTION 'invalid_stage';
  END IF;

  SELECT current_stage INTO v_current FROM public.candidates WHERE id = v_cand;
  v_idx_new := array_position(v_order, _stage);
  v_idx_cur := COALESCE(array_position(v_order, v_current), 1);

  -- Никогда не движемся назад: stage в БД монотонно растёт.
  IF v_idx_new > v_idx_cur THEN
    UPDATE public.candidates SET current_stage = _stage, updated_at = now() WHERE id = v_cand;
    RETURN _stage;
  END IF;
  RETURN COALESCE(v_current, _stage);
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_set_stage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_set_stage(text) TO anon, authenticated, service_role;
