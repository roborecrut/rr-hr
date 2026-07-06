CREATE OR REPLACE FUNCTION public.employer_list_candidates()
RETURNS TABLE (
  id uuid,
  public_id text,
  project_id uuid,
  project_public_id text,
  role_name text,
  company_id uuid,
  company_name text,
  company_slug text,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz,
  last_login_at timestamptz,
  current_stage text,
  crm_stage text,
  crm_stage_manual boolean,
  registered_via text,
  resume_score numeric,
  checklist_score numeric,
  situations_score numeric,
  interview_score numeric,
  overall_score numeric,
  has_resume boolean,
  has_checklist boolean,
  has_situations boolean,
  has_overall boolean,
  training_passed text[],
  certified boolean,
  derived_stage text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emp uuid;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  SELECT e.id INTO v_emp FROM public.employers e WHERE e.user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL AND NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.public_id,
    c.project_id,
    p.public_id,
    COALESCE(NULLIF(c.role_name,''), p.role_name),
    c.company_id,
    co.name,
    co.slug,
    c.full_name,
    c.email,
    c.phone,
    c.avatar_url,
    c.created_at,
    c.last_login_at,
    c.current_stage::text,
    c.crm_stage::text,
    COALESCE(c.crm_stage_manual, false),
    c.registered_via::text,
    cs.resume_score, cs.checklist_score, cs.situations_score, cs.interview_score, cs.overall_score,
    -- Truthful completion flags based on *_feedback JSONB presence
    -- (score columns default to 0, so NOT NULL was always true — bug).
    (cs.resume_feedback IS NOT NULL),
    (cs.checklist_feedback IS NOT NULL),
    (cs.situations_feedback IS NOT NULL),
    (cs.overall_generated_at IS NOT NULL),
    COALESCE((
      SELECT array_agg(sp.stage)
        FROM public.candidate_stage_progress sp
       WHERE sp.candidate_id = c.id AND sp.passed_at IS NOT NULL
    ), ARRAY[]::text[]),
    EXISTS (SELECT 1 FROM public.certifications cert WHERE cert.candidate_id = c.id),
    -- Forward-looking CRM stage: which column the candidate is CURRENTLY in.
    -- e.g. resume screened → they are now working on the checklist step.
    CASE
      WHEN EXISTS (SELECT 1 FROM public.certifications cert WHERE cert.candidate_id = c.id) THEN 'certified'
      WHEN EXISTS (
        SELECT 1 FROM public.candidate_stage_progress sp
         WHERE sp.candidate_id = c.id AND sp.stage = 'product' AND sp.passed_at IS NOT NULL)
        THEN 'systems'
      WHEN EXISTS (
        SELECT 1 FROM public.candidate_stage_progress sp
         WHERE sp.candidate_id = c.id AND sp.stage = 'professional' AND sp.passed_at IS NOT NULL)
        THEN 'product'
      WHEN cs.overall_generated_at IS NOT NULL THEN 'professional'
      WHEN cs.situations_feedback IS NOT NULL THEN 'situations'
      WHEN cs.checklist_feedback IS NOT NULL THEN 'situations'
      WHEN cs.resume_feedback IS NOT NULL THEN 'checklist'
      WHEN NULLIF(c.resume_text,'') IS NOT NULL OR c.resume_url IS NOT NULL THEN 'screening'
      ELSE 'registration'
    END
  FROM public.candidates c
  JOIN public.projects p ON p.id = c.project_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.candidate_scores cs ON cs.candidate_id = c.id
  WHERE v_is_admin OR p.employer_id = v_emp;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.employer_list_candidates() TO authenticated;