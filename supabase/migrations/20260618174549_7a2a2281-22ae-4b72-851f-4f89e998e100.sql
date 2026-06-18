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
  v_cand_a     uuid := gen_random_uuid();
  v_cand_b     uuid := gen_random_uuid();
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
  v_job_succ_for_noscore uuid := gen_random_uuid();
  v_job_fb     uuid := gen_random_uuid();

  v_resp jsonb;
  v_pre_crm text;
  v_post_crm text;
  v_pre_overall numeric;
  v_post_overall numeric;
  v_results jsonb := '[]'::jsonb;
  v_total int := 0;
  v_failed int := 0;
  v_ok boolean;
BEGIN
  INSERT INTO public.employers(id, contact_email, contact_name)
    VALUES (v_employer_id, 'test-fix2@example.invalid', 'Test Fix2');
  INSERT INTO public.companies(id, owner_employer_id, name)
    VALUES (v_company_id, v_employer_id, 'Test Fix2 Co');

  INSERT INTO public.projects(id, employer_id, role_name, interview_pass_score) VALUES
    (v_proj_a, v_employer_id, 'role A', 75),
    (v_proj_b, v_employer_id, 'role B', 75);

  INSERT INTO public.candidates(id, project_id, role_name, current_stage) VALUES
    (v_cand_a, v_proj_a, 'A', 'terms'),
    (v_cand_b, v_proj_b, 'B', 'terms'),
    (v_cand_noscore, v_proj_a, 'NoScore', 'terms'),
    (v_cand_done, v_proj_a, 'Done', 'training'),
    (v_cand_conflict, v_proj_a, 'Conf', 'certified'),
    (v_cand_fb, v_proj_a, 'FB', 'interview');

  INSERT INTO public.candidate_scores(candidate_id, situations_score, situations_feedback) VALUES
    (v_cand_a,        90, '{"items":[]}'::jsonb),
    (v_cand_b,        30, '{"items":[]}'::jsonb),
    (v_cand_done,     90, '{"items":[]}'::jsonb),
    (v_cand_conflict, 90, '{"items":[]}'::jsonb),
    (v_cand_fb,       95, '{"items":[]}'::jsonb);

  INSERT INTO public.ai_jobs(id, job_type, candidate_id, status, idempotency_key, request_snapshot) VALUES
    (v_job_ok,                'grade_situations_v2', v_cand_a,        'primary_succeeded',    'fix2_k1',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_low,               'grade_situations_v2', v_cand_b,        'primary_succeeded',    'fix2_k2',  jsonb_build_object('project_id', v_proj_b)),
    (v_job_fail,              'grade_situations_v2', v_cand_a,        'orchestration_failed', 'fix2_k3',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_run,               'grade_situations_v2', v_cand_a,        'primary_running',      'fix2_k4',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_chk,               'grade_checklist_v2',  v_cand_a,        'primary_succeeded',    'fix2_k5',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_v1,                'grade_situations',    v_cand_a,        'primary_succeeded',    'fix2_k6',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_other,             'grade_situations_v2', v_cand_b,        'primary_succeeded',    'fix2_k7',  jsonb_build_object('project_id', v_proj_b)),
    (v_job_succ_for_noscore,  'grade_situations_v2', v_cand_noscore,  'fallback_succeeded',   'fix2_k9',  jsonb_build_object('project_id', v_proj_a)),
    (v_job_for_done,          'grade_situations_v2', v_cand_done,     'primary_succeeded',    'fix2_k10', jsonb_build_object('project_id', v_proj_a)),
    (v_job_for_conflict,      'grade_situations_v2', v_cand_conflict, 'primary_succeeded',    'fix2_k11', jsonb_build_object('project_id', v_proj_a)),
    (v_job_fb,                'grade_situations_v2', v_cand_fb,       'fallback_succeeded',   'fix2_k12', jsonb_build_object('project_id', v_proj_a));

  -- Scenario 1: success path + CRM/scores invariance
  v_pre_crm := (SELECT crm_stage::text FROM public.candidates WHERE id = v_cand_a);
  v_pre_overall := (SELECT overall_score FROM public.candidate_scores WHERE candidate_id = v_cand_a);
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_ok);
  v_post_crm := (SELECT crm_stage::text FROM public.candidates WHERE id = v_cand_a);
  v_post_overall := (SELECT overall_score FROM public.candidate_scores WHERE candidate_id = v_cand_a);
  v_ok := (v_resp->>'ok')='true' AND (v_resp->>'advanced')='true'
    AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_a) = 'training'
    AND v_pre_crm IS NOT DISTINCT FROM v_post_crm
    AND v_pre_overall IS NOT DISTINCT FROM v_post_overall;
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','success_advances_to_training_and_preserves_scores_crm','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 2: idempotent repeat
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_ok);
  v_ok := (v_resp->>'ok')='true' AND (v_resp->>'already')='true' AND (v_resp->>'advanced')='false';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','repeat_returns_already_true','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 3: below threshold
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_b, v_job_low);
  v_ok := (v_resp->>'ok')='true' AND (v_resp->>'advanced')='false' AND (v_resp->>'reason')='below_threshold'
    AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_b) = 'terms';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','below_threshold_does_not_advance','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 4
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_fail);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_succeeded';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','status_orchestration_failed_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 5
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_run);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_succeeded';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','status_primary_running_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 6
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_chk);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='job_type_not_allowed';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','job_type_checklist_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 7
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_v1);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='job_type_not_allowed';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','job_type_v1_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 8
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, v_job_other);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='forbidden';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','foreign_candidate_job_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 9
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_noscore, v_job_succ_for_noscore);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='overall_score_missing'
    AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_noscore) = 'terms';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','missing_overall_score_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 10
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_done, v_job_for_done);
  v_ok := (v_resp->>'ok')='true' AND (v_resp->>'already')='true';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','already_in_training_returns_already_true','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 11
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_conflict, v_job_for_conflict);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='stage_conflict'
    AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_conflict) = 'certified';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','source_stage_certified_conflict','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 12
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_a, gen_random_uuid());
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='job_not_found';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','unknown_job_id_returns_not_found','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 13
  v_resp := public.advance_candidate_stage_after_ai_job_v2(NULL, v_job_ok);
  v_ok := (v_resp->>'ok')='false' AND (v_resp->>'error')='bad_args';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','null_candidate_rejected','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Scenario 14
  v_resp := public.advance_candidate_stage_after_ai_job_v2(v_cand_fb, v_job_fb);
  v_ok := (v_resp->>'ok')='true' AND (v_resp->>'advanced')='true'
    AND (SELECT current_stage::text FROM public.candidates WHERE id = v_cand_fb) = 'training';
  v_results := v_results || jsonb_build_array(jsonb_build_object('name','fallback_succeeded_allowed','ok',v_ok,'detail',v_resp));
  v_total := v_total+1; IF NOT v_ok THEN v_failed := v_failed+1; END IF;

  -- Cleanup
  DELETE FROM public.ai_jobs WHERE id IN (
    v_job_ok, v_job_low, v_job_fail, v_job_run, v_job_chk, v_job_v1, v_job_other,
    v_job_succ_for_noscore, v_job_for_done, v_job_for_conflict, v_job_fb);
  DELETE FROM public.candidate_scores WHERE candidate_id IN (
    v_cand_a, v_cand_b, v_cand_done, v_cand_conflict, v_cand_fb);
  DELETE FROM public.candidates WHERE id IN (
    v_cand_a, v_cand_b, v_cand_noscore, v_cand_done, v_cand_conflict, v_cand_fb);
  DELETE FROM public.projects WHERE id IN (v_proj_a, v_proj_b);
  DELETE FROM public.companies WHERE id = v_company_id;
  DELETE FROM public.employers WHERE id = v_employer_id;

  RETURN jsonb_build_object('ok', v_failed=0, 'total', v_total, 'failed', v_failed, 'results', v_results);

EXCEPTION WHEN OTHERS THEN
  BEGIN DELETE FROM public.ai_jobs WHERE id IN (
    v_job_ok, v_job_low, v_job_fail, v_job_run, v_job_chk, v_job_v1, v_job_other,
    v_job_succ_for_noscore, v_job_for_done, v_job_for_conflict, v_job_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.candidate_scores WHERE candidate_id IN (
    v_cand_a, v_cand_b, v_cand_done, v_cand_conflict, v_cand_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.candidates WHERE id IN (
    v_cand_a, v_cand_b, v_cand_noscore, v_cand_done, v_cand_conflict, v_cand_fb);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.projects WHERE id IN (v_proj_a, v_proj_b); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.companies WHERE id = v_company_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.employers WHERE id = v_employer_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public._test_advance_stage_v2_run() TO PUBLIC;