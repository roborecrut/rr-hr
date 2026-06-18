-- D1a-FIX-2: server-authoritative stage advance after situations v2.

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
  v_overall        numeric;
  v_pass_score     integer;
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

  SELECT overall_score INTO v_overall
    FROM public.candidate_scores WHERE candidate_id = _candidate_id;
  IF v_overall IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'overall_score_missing');
  END IF;
  SELECT interview_pass_score INTO v_pass_score
    FROM public.projects WHERE id = v_cand_project;
  IF v_pass_score IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pass_score_missing');
  END IF;

  IF v_overall < v_pass_score THEN
    RETURN jsonb_build_object('ok', true, 'advanced', false, 'reason', 'below_threshold',
                              'current_stage', v_current::text);
  END IF;

  UPDATE public.candidates SET current_stage = v_next WHERE id = _candidate_id;
  RETURN jsonb_build_object('ok', true, 'advanced', true, 'current_stage', v_next::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.advance_candidate_stage_after_ai_job_v2(uuid,uuid) TO service_role;


-- Real-DB integration test runner. Uses a temp table for assertion results to
-- avoid nested PROCEDURE syntax issues in plpgsql DECLARE blocks.
CREATE OR REPLACE FUNCTION public._test_advance_stage_v2_run()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_id uuid := gen_random_uuid();
  v_company_id  uuid := gen_random_uuid();
  v_proj_a     uuid := gen_random_uuid();
  v_proj_b     uuid := gen_random_uuid();
  v_proj_nopass uuid := gen_random_uuid();
  v_cand_a     uuid := gen_random_uuid();
  v_cand_b     uuid := gen_random_uuid();
  v_cand_nopass uuid := gen_random_uuid();
  v_cand_noscore uuid := gen_random_uuid();
  v_cand_done  uuid := gen_random_uuid();
  v_cand_conflict uuid := gen_random_uuid();
  v_cand_fb    uuid := gen_random_uuid();
  v_job_ok     uuid := gen_random_uuid();
  v_job_low    uuid := gen_random_uuid();
  v_job_fail   uuid := gen_random_uuid();
  v_job_run    uuid := gen_random_uuid();
  v_job_chk    uuid := gen_random_uuid();
  v_job_v1     uuid := gen_random_uuid();
  v_job_other  uuid := gen_random_uuid();
  v_job_for_done uuid := gen_random_uuid();
  v_job_for_conflict uuid := gen_random_uuid();
  v_job_succ_for_nopass uuid := gen_random_uuid();
  v_job_succ_for_noscore uuid := gen_random_uuid();
  v_job_fb     uuid := gen_random_uuid();

  v_resp jsonb;
  v_pre_crm text;
  v_post_crm text;
  v_pre_overall numeric;
  v_post_overall numeric;
  v_out jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _adv_v2_results(name text, ok boolean, detail jsonb) ON COMMIT DROP;
  DELETE FROM _adv_v2_results;

  -- Fixtures
  INSERT INTO public.employers(id, email, full_name, created_at, updated_at)
    VALUES (v_employer_id, 'test-fix2@example.invalid', 'Test Fix2', now(), now());
  INSERT INTO public.companies(id, employer_id, name, created_at, updated_at)
    VALUES (v_company_id, v_employer_id, 'Test Fix2 Co', now(), now());

  INSERT INTO public.projects(id, employer_id, company_id, role_name, interview_pass_score, created_at, updated_at)
    VALUES (v_proj_a, v_employer_id, v_company_id, 'role A', 75, now(), now());
  INSERT INTO public.projects(id, employer_id, company_id, role_name, interview_pass_score, created_at, updated_at)
    VALUES (v_proj_b, v_employer_id, v_company_id, 'role B', 75, now(), now());
  INSERT INTO public.projects(id, employer_id, company_id, role_name, interview_pass_score, created_at, updated_at)
    VALUES (v_proj_nopass, v_employer_id, v_company_id, 'role NoPass', NULL, now(), now());

  INSERT INTO public.candidates(id, project_id, role_name, current_stage) VALUES
    (v_cand_a, v_proj_a, 'A', 'terms'),
    (v_cand_b, v_proj_b, 'B', 'terms'),
    (v_cand_nopass, v_proj_nopass, 'NoPass', 'terms'),
    (v_cand_noscore, v_proj_a, 'NoScore', 'terms'),
    (v_cand_done, v_proj_a, 'Done', 'training'),
    (v_cand_conflict, v_proj_a, 'Conf', 'certified'),
    (v_cand_fb, v_proj_a, 'FB', 'interview');

  INSERT INTO public.candidate_scores(candidate_id, situations_score, situations_feedback) VALUES
    (v_cand_a,        90, '{"items":[]}'::jsonb),
    (v_cand_b,        30, '{"items":[]}'::jsonb),
    (v_cand_nopass,   90, '{"items":[]}'::jsonb),
    (v_cand_done,     90, '{"items":[]}'::jsonb),
    (v_cand_conflict, 90, '{"items":[]}'::jsonb),
    (v_cand_fb,       95, '{"items":[]}'::jsonb);

  INSERT INTO public.ai_jobs(id, job_type, candidate_id, status, idempotency_key, request_snapshot, fallback_allowed, fallback_used, credits_status) VALUES
    (v_job_ok,                'grade_situations_v2', v_cand_a,        'primary_succeeded',    'fix2_k1',  jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_low,               'grade_situations_v2', v_cand_b,        'primary_succeeded',    'fix2_k2',  jsonb_build_object('project_id', v_proj_b), true, false, 'not_charged'),
    (v_job_fail,              'grade_situations_v2', v_cand_a,        'orchestration_failed', 'fix2_k3',  jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_run,               'grade_situations_v2', v_cand_a,        'primary_running',      'fix2_k4',  jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_chk,               'grade_checklist_v2',  v_cand_a,        'primary_succeeded',    'fix2_k5',  jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_v1,                'grade_situations',    v_cand_a,        'primary_succeeded',    'fix2_k6',  jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_other,             'grade_situations_v2', v_cand_b,        'primary_succeeded',    'fix2_k7',  jsonb_build_object('project_id', v_proj_b), true, false, 'not_charged'),
    (v_job_succ_for_nopass,   'grade_situations_v2', v_cand_nopass,   'primary_succeeded',    'fix2_k8',  jsonb_build_object('project_id', v_proj_nopass), true, false, 'not_charged'),
    (v_job_succ_for_noscore,  'grade_situations_v2', v_cand_noscore,  'fallback_succeeded',   'fix2_k9',  jsonb_build_object('project_id', v_proj_a), true, true, 'not_charged'),
    (v_job_for_done,          'grade_situations_v2', v_cand_done,     'primary_succeeded',    'fix2_k10', jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_for_conflict,      'grade_situations_v2', v_cand_conflict, 'primary_succeeded',    'fix2_k11', jsonb_build_object('project_id', v_proj_a), true, false, 'not_charged'),
    (v_job_fb,                'grade_situations_v2', v_cand_fb,       'fallback_succeeded',   'fix2_k12', jsonb_build_object('project_id', v_proj_a), true, true, 'not_charged');

  -- Scenario 1: success
  v_pre_crm := (SELECT crm_stage::text FROM public.candidates WHERE id = v_cand_a);
  v_pre_overall := (SELECT overall_score FROM public.candidate_scores WHERE candidate_id = v_cand_a);
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_ok);
  v_post_crm := (SELECT crm_stage::text FROM public.candidates WHERE id = v_cand_a);
  v_post_overall := (SELECT overall_score FROM public.candidate_scores WHERE candidate_id = v_cand_a);
  INSERT INTO _adv_v2_results VALUES ('success_advances_to_training',
    (v_resp->>'ok')='true' AND (v_resp->>'advanced')='true'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_a) = 'training'
      AND v_pre_crm IS NOT DISTINCT FROM v_post_crm
      AND v_pre_overall IS NOT DISTINCT FROM v_post_overall, v_resp);

  -- Scenario 2: repeat
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_ok);
  INSERT INTO _adv_v2_results VALUES ('repeat_returns_already_true',
    (v_resp->>'ok')='true' AND (v_resp->>'already')='true' AND (v_resp->>'advanced')='false', v_resp);

  -- Scenario 3: below threshold
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_b, v_job_low);
  INSERT INTO _adv_v2_results VALUES ('below_threshold_does_not_advance',
    (v_resp->>'ok')='true' AND (v_resp->>'advanced')='false' AND (v_resp->>'reason')='below_threshold'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_b) = 'terms', v_resp);

  -- Scenario 4: orchestration_failed rejected
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_fail);
  INSERT INTO _adv_v2_results VALUES ('status_orchestration_failed_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_succeeded', v_resp);

  -- Scenario 5: primary_running rejected
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_run);
  INSERT INTO _adv_v2_results VALUES ('status_primary_running_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_succeeded', v_resp);

  -- Scenario 6: checklist v2 job rejected
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_chk);
  INSERT INTO _adv_v2_results VALUES ('job_type_checklist_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='job_type_not_allowed', v_resp);

  -- Scenario 7: legacy v1 job rejected
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_v1);
  INSERT INTO _adv_v2_results VALUES ('job_type_v1_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='job_type_not_allowed', v_resp);

  -- Scenario 8: foreign candidate's job
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_other);
  INSERT INTO _adv_v2_results VALUES ('foreign_candidate_job_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='forbidden', v_resp);

  -- Scenario 9: missing overall_score
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_noscore, v_job_succ_for_noscore);
  INSERT INTO _adv_v2_results VALUES ('missing_overall_score_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='overall_score_missing'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_noscore) = 'terms', v_resp);

  -- Scenario 10: missing pass score
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_nopass, v_job_succ_for_nopass);
  INSERT INTO _adv_v2_results VALUES ('missing_pass_score_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='pass_score_missing'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_nopass) = 'terms', v_resp);

  -- Scenario 11: already in next stage
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_done, v_job_for_done);
  INSERT INTO _adv_v2_results VALUES ('already_in_training_returns_already_true',
    (v_resp->>'ok')='true' AND (v_resp->>'already')='true', v_resp);

  -- Scenario 12: stage_conflict (certified is past training)
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_conflict, v_job_for_conflict);
  INSERT INTO _adv_v2_results VALUES ('source_stage_certified_conflict',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='stage_conflict'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_conflict) = 'certified', v_resp);

  -- Scenario 13: unknown job_id
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, gen_random_uuid());
  INSERT INTO _adv_v2_results VALUES ('unknown_job_id_returns_not_found',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_found', v_resp);

  -- Scenario 14: bad args (null candidate)
  v_resp := public.advance_candidate_stage_after_ai_job_v2(NULL, v_job_ok);
  INSERT INTO _adv_v2_results VALUES ('null_candidate_rejected',
    (v_resp->>'ok')='false' AND (v_resp->>'error')='bad_args', v_resp);

  -- Scenario 15: fallback_succeeded is allowed
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_fb, v_job_fb);
  INSERT INTO _adv_v2_results VALUES ('fallback_succeeded_allowed',
    (v_resp->>'ok')='true' AND (v_resp->>'advanced')='true'
      AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_fb) = 'training', v_resp);

  -- Aggregate
  SELECT jsonb_build_object(
    'ok',     bool_and(ok),
    'total',  count(*),
    'failed', count(*) FILTER (WHERE NOT ok),
    'results', jsonb_agg(jsonb_build_object('name', name, 'ok', ok, 'detail', detail) ORDER BY name)
  ) INTO v_out FROM _adv_v2_results;

  -- Cleanup
  DELETE FROM public.ai_jobs WHERE id IN (
    v_job_ok, v_job_low, v_job_fail, v_job_run, v_job_chk, v_job_v1, v_job_other,
    v_job_succ_for_nopass, v_job_succ_for_noscore, v_job_for_done, v_job_for_conflict, v_job_fb);
  DELETE FROM public.candidate_scores WHERE candidate_id IN (
    v_cand_a, v_cand_b, v_cand_nopass, v_cand_done, v_cand_conflict, v_cand_fb);
  DELETE FROM public.candidates WHERE id IN (
    v_cand_a, v_cand_b, v_cand_nopass, v_cand_noscore, v_cand_done, v_cand_conflict, v_cand_fb);
  DELETE FROM public.projects WHERE id IN (v_proj_a, v_proj_b, v_proj_nopass);
  DELETE FROM public.companies WHERE id = v_company_id;
  DELETE FROM public.employers WHERE id = v_employer_id;

  RETURN v_out;
EXCEPTION WHEN OTHERS THEN
  BEGIN DELETE FROM public.ai_jobs WHERE id IN (
    v_job_ok, v_job_low, v_job_fail, v_job_run, v_job_chk, v_job_v1, v_job_other,
    v_job_succ_for_nopass, v_job_succ_for_noscore, v_job_for_done, v_job_for_conflict, v_job_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.candidate_scores WHERE candidate_id IN (
    v_cand_a, v_cand_b, v_cand_nopass, v_cand_done, v_cand_conflict, v_cand_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.candidates WHERE id IN (
    v_cand_a, v_cand_b, v_cand_nopass, v_cand_noscore, v_cand_done, v_cand_conflict, v_cand_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.projects WHERE id IN (v_proj_a, v_proj_b, v_proj_nopass); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.companies WHERE id = v_company_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.employers WHERE id = v_employer_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._test_advance_stage_v2_run() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._test_advance_stage_v2_run() FROM anon;
REVOKE EXECUTE ON FUNCTION public._test_advance_stage_v2_run() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public._test_advance_stage_v2_run() TO service_role;