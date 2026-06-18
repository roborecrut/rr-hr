-- Replace the function with extra debug fields embedded into responses to
-- understand why scenario 1 returns below_threshold under fixtures.
CREATE OR REPLACE FUNCTION public._test_advance_stage_v2_debug_dump()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_id uuid := gen_random_uuid();
  v_company_id  uuid := gen_random_uuid();
  v_proj_a     uuid := gen_random_uuid();
  v_cand_a     uuid := gen_random_uuid();
  v_overall numeric;
  v_pass int;
  v_sit numeric;
  v_out jsonb;
BEGIN
  INSERT INTO public.employers(id, contact_email, contact_name)
    VALUES (v_employer_id, 'dbg@example.invalid', 'Dbg');
  INSERT INTO public.companies(id, owner_employer_id, name)
    VALUES (v_company_id, v_employer_id, 'Dbg Co');
  INSERT INTO public.projects(id, employer_id, role_name, interview_pass_score) VALUES
    (v_proj_a, v_employer_id, 'role A', 75);
  INSERT INTO public.candidates(id, project_id, role_name, current_stage) VALUES
    (v_cand_a, v_proj_a, 'A', 'terms');
  INSERT INTO public.candidate_scores(candidate_id, situations_score, situations_feedback) VALUES
    (v_cand_a, 90, '{"items":[]}'::jsonb);

  SELECT overall_score, situations_score INTO v_overall, v_sit
    FROM public.candidate_scores WHERE candidate_id = v_cand_a;
  SELECT interview_pass_score INTO v_pass FROM public.projects WHERE id = v_proj_a;

  v_out := jsonb_build_object('overall', v_overall, 'situations', v_sit, 'pass', v_pass);

  DELETE FROM public.candidate_scores WHERE candidate_id = v_cand_a;
  DELETE FROM public.candidates WHERE id = v_cand_a;
  DELETE FROM public.projects WHERE id = v_proj_a;
  DELETE FROM public.companies WHERE id = v_company_id;
  DELETE FROM public.employers WHERE id = v_employer_id;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public._test_advance_stage_v2_debug_dump() TO PUBLIC;