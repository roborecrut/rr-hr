
-- RPC: атомарно переставить лимиты между общим пулом работодателя
-- (employers.interview_credits / training_credits) и вакансией
-- (projects.interview_limit / training_limit).
--   * рост лимита проекта → списываем разницу с employers.*_credits
--   * снижение лимита проекта → возвращаем разницу в employers.*_credits
--   * запрещаем опускать ниже projects.*_used
--   * запрещаем уходить в минус по employers.*_credits
CREATE OR REPLACE FUNCTION public.reallocate_project_limits(
  _project uuid,
  _new_interview_limit int,
  _new_training_limit  int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_owner_uid uuid;
  v_caller uuid := auth.uid();
  v_cur_i int; v_cur_t int; v_used_i int; v_used_t int;
  v_pool_i int; v_pool_t int;
  v_delta_i int; v_delta_t int;
BEGIN
  IF _project IS NULL THEN RAISE EXCEPTION 'no_project'; END IF;
  IF _new_interview_limit < 0 OR _new_training_limit < 0 THEN
    RAISE EXCEPTION 'negative_limit';
  END IF;

  SELECT p.employer_id, p.interview_limit, p.training_limit,
         p.interview_used, p.training_used
    INTO v_emp, v_cur_i, v_cur_t, v_used_i, v_used_t
    FROM public.projects p WHERE p.id = _project
    FOR UPDATE;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_project_row'; END IF;

  SELECT e.user_id, e.interview_credits, e.training_credits
    INTO v_owner_uid, v_pool_i, v_pool_t
    FROM public.employers e WHERE e.id = v_emp
    FOR UPDATE;

  IF v_caller IS NULL OR (v_caller <> v_owner_uid AND NOT public.has_role(v_caller,'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _new_interview_limit < v_used_i THEN
    RAISE EXCEPTION 'interview_limit_below_used';
  END IF;
  IF _new_training_limit < v_used_t THEN
    RAISE EXCEPTION 'training_limit_below_used';
  END IF;

  v_delta_i := _new_interview_limit - v_cur_i; -- >0 берём из пула, <0 возвращаем
  v_delta_t := _new_training_limit  - v_cur_t;

  IF v_delta_i > 0 AND v_pool_i < v_delta_i THEN
    RAISE EXCEPTION 'not_enough_interview_pool';
  END IF;
  IF v_delta_t > 0 AND v_pool_t < v_delta_t THEN
    RAISE EXCEPTION 'not_enough_training_pool';
  END IF;

  UPDATE public.projects
     SET interview_limit = _new_interview_limit,
         training_limit  = _new_training_limit
   WHERE id = _project;

  UPDATE public.employers
     SET interview_credits = interview_credits - v_delta_i,
         training_credits  = training_credits  - v_delta_t
   WHERE id = v_emp;

  RETURN jsonb_build_object(
    'ok', true,
    'project_interview_limit', _new_interview_limit,
    'project_training_limit',  _new_training_limit,
    'employer_interview_pool', v_pool_i - v_delta_i,
    'employer_training_pool',  v_pool_t - v_delta_t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reallocate_project_limits(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reallocate_project_limits(uuid, int, int) TO authenticated, service_role;
