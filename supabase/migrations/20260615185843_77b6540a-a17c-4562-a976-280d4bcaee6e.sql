CREATE OR REPLACE FUNCTION public.project_create_draft(_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_owner uuid;
  v_existing public.projects;
  v_new public.projects;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_active_count int;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  IF _company IS NOT NULL THEN
    SELECT owner_employer_id INTO v_owner FROM public.companies WHERE id = _company;
    IF v_owner IS NULL THEN RAISE EXCEPTION 'company_not_found'; END IF;
    IF v_owner <> v_emp AND NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSIF NOT v_is_admin THEN
    SELECT count(*) INTO v_active_count
      FROM public.companies
      WHERE owner_employer_id = v_emp AND status = 'active';
    IF v_active_count = 0 THEN
      RAISE EXCEPTION 'company_required' USING HINT = 'Заполните компанию перед созданием вакансии';
    END IF;
  END IF;

  SELECT * INTO v_existing FROM public.projects
    WHERE employer_id = v_emp
      AND (company_id IS NOT DISTINCT FROM _company)
      AND COALESCE(role_name,'') = ''
      AND COALESCE(is_published, false) = false
    ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing.id, 'public_id', v_existing.public_id, 'reused', true);
  END IF;

  INSERT INTO public.projects (employer_id, company_id, role_name, is_published)
  VALUES (v_emp, _company, '', false)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('id', v_new.id, 'public_id', v_new.public_id, 'reused', false);
END $$;

CREATE OR REPLACE FUNCTION public.candidate_scores_recompute_overall()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum numeric := 0;
  v_cnt int := 0;
BEGIN
  IF NEW.resume_score     IS NOT NULL THEN v_sum := v_sum + NEW.resume_score;     v_cnt := v_cnt + 1; END IF;
  IF NEW.checklist_score  IS NOT NULL THEN v_sum := v_sum + NEW.checklist_score;  v_cnt := v_cnt + 1; END IF;
  IF NEW.situations_score IS NOT NULL THEN v_sum := v_sum + NEW.situations_score; v_cnt := v_cnt + 1; END IF;
  IF NEW.interview_score  IS NOT NULL THEN v_sum := v_sum + NEW.interview_score;  v_cnt := v_cnt + 1; END IF;
  IF v_cnt > 0 THEN
    NEW.overall_score := round(v_sum / v_cnt);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_candidate_scores_recompute_overall ON public.candidate_scores;
CREATE TRIGGER trg_candidate_scores_recompute_overall
  BEFORE INSERT OR UPDATE OF resume_score, checklist_score, situations_score, interview_score
  ON public.candidate_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.candidate_scores_recompute_overall();

UPDATE public.candidate_scores SET
  overall_score = round((
    COALESCE(resume_score, 0) + COALESCE(checklist_score, 0) +
    COALESCE(situations_score, 0) + COALESCE(interview_score, 0)
  ) / NULLIF(
    (CASE WHEN resume_score     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN checklist_score  IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN situations_score IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN interview_score  IS NOT NULL THEN 1 ELSE 0 END), 0)::numeric)
WHERE resume_score IS NOT NULL OR checklist_score IS NOT NULL
   OR situations_score IS NOT NULL OR interview_score IS NOT NULL;