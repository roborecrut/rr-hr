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
  v_pass_score numeric := 75;
  v_interview_avg numeric;
  v_interview_complete boolean := false;
  v_interview_passed boolean := false;
BEGIN
  IF v_cand IS NULL THEN
    RETURN jsonb_build_object('stage','terms','authorized', false);
  END IF;

  SELECT project_id, current_stage INTO v_proj, v_saved
    FROM public.candidates WHERE id = v_cand;

  IF v_proj IS NOT NULL THEN
    SELECT COALESCE(interview_pass_score, 75) INTO v_pass_score
      FROM public.projects WHERE id = v_proj;
  END IF;

  SELECT resume_score, checklist_score, situations_score, interview_score, overall_score
    INTO v_sc
    FROM public.candidate_scores WHERE candidate_id = v_cand;

  v_interview_complete := v_sc.resume_score IS NOT NULL
                          AND v_sc.checklist_score IS NOT NULL
                          AND v_sc.situations_score IS NOT NULL;
  IF v_interview_complete THEN
    v_interview_avg := ROUND(((v_sc.resume_score + v_sc.checklist_score + v_sc.situations_score) / 3.0)::numeric, 2);
    v_interview_passed := v_interview_avg >= v_pass_score;
  END IF;

  SELECT COALESCE(array_agg(stage) FILTER (WHERE passed_at IS NOT NULL), ARRAY[]::text[])
    INTO v_passed
    FROM public.candidate_stage_progress WHERE candidate_id = v_cand;

  v_training_done := ('professional' = ANY(v_passed))
                     AND ('product' = ANY(v_passed))
                     AND ('system' = ANY(v_passed));

  SELECT count(*) INTO v_cert_count
    FROM public.certifications WHERE candidate_id = v_cand;

  IF v_proj IS NOT NULL THEN v_stage := 'terms'; END IF;
  IF v_sc.resume_score IS NOT NULL
     OR v_sc.checklist_score IS NOT NULL
     OR v_sc.situations_score IS NOT NULL THEN v_stage := 'interview'; END IF;
  IF v_interview_complete AND NOT v_interview_passed THEN v_stage := 'interview'; END IF;
  IF v_interview_passed THEN v_stage := 'training'; END IF;
  IF v_training_done THEN v_stage := 'certified'; END IF;
  IF v_cert_count > 0 THEN v_stage := 'certified'; END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'stage', v_stage,
    'saved_stage', COALESCE(v_saved,'terms'),
    'terms_done', v_proj IS NOT NULL,
    'interview_started', (v_sc.resume_score IS NOT NULL OR v_sc.checklist_score IS NOT NULL OR v_sc.situations_score IS NOT NULL),
    'interview_complete', v_interview_complete,
    'interview_average', v_interview_avg,
    'interview_pass_score', v_pass_score,
    'interview_passed', v_interview_passed,
    'scoring_done', v_interview_complete,
    'training_done', v_training_done,
    'training_passed', to_jsonb(v_passed),
    'certified', v_cert_count > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_flow_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_flow_state() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.advance_candidate_stage_after_ai_job_v2(
  _candidate_id uuid,
  _job_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_owner      uuid;
  v_job_type       text;
  v_job_status     text;
  v_job_snap       jsonb;
  v_job_project    uuid;
  v_cand_project   uuid;
  v_current        public.candidate_stage;
  v_pass_score     numeric;
  v_resume         numeric;
  v_checklist      numeric;
  v_situations     numeric;
  v_average        numeric;
  v_allowed_src    public.candidate_stage[] := ARRAY['terms','interview','scoring']::public.candidate_stage[];
  v_next           public.candidate_stage   := 'training'::public.candidate_stage;
BEGIN
  IF _candidate_id IS NULL OR _job_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  SELECT candidate_id, job_type, status, request_snapshot
    INTO v_job_owner, v_job_type, v_job_status, v_job_snap
    FROM public.ai_jobs WHERE id = _job_id;
  IF v_job_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;
  IF v_job_owner <> _candidate_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_job_type <> 'grade_situations_v2' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_type_not_allowed');
  END IF;
  IF v_job_status NOT IN ('primary_succeeded','fallback_succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_succeeded', 'status', v_job_status);
  END IF;

  SELECT project_id, current_stage INTO v_cand_project, v_current
    FROM public.candidates WHERE id = _candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'candidate_not_found');
  END IF;
  v_job_project := NULLIF(v_job_snap->>'project_id','')::uuid;
  IF v_job_project IS NOT NULL AND v_cand_project IS NOT NULL
     AND v_job_project <> v_cand_project THEN
    RETURN jsonb_build_object('ok', false, 'error', 'project_mismatch');
  END IF;

  IF v_current = v_next THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'advanced', false,
                              'current_stage', v_current::text);
  END IF;

  IF NOT (v_current = ANY (v_allowed_src)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_conflict',
                              'current_stage', v_current::text);
  END IF;

  SELECT resume_score, checklist_score, situations_score
    INTO v_resume, v_checklist, v_situations
    FROM public.candidate_scores WHERE candidate_id = _candidate_id;
  IF v_resume IS NULL OR v_checklist IS NULL OR v_situations IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'interview_incomplete');
  END IF;

  SELECT COALESCE(interview_pass_score, 75) INTO v_pass_score
    FROM public.projects WHERE id = v_cand_project;
  IF v_pass_score IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pass_score_missing');
  END IF;

  v_average := ROUND(((v_resume + v_checklist + v_situations) / 3.0)::numeric, 2);
  IF v_average < v_pass_score THEN
    RETURN jsonb_build_object('ok', true, 'advanced', false, 'reason', 'below_threshold',
                              'average', v_average, 'pass_score', v_pass_score,
                              'current_stage', v_current::text);
  END IF;

  UPDATE public.candidates SET current_stage = v_next WHERE id = _candidate_id;
  RETURN jsonb_build_object('ok', true, 'advanced', true, 'average', v_average, 'pass_score', v_pass_score, 'current_stage', v_next::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) TO service_role;