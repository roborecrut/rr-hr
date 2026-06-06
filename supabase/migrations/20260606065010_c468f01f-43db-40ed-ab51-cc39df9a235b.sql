CREATE OR REPLACE FUNCTION public.candidate_public_cabinet(_public_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pid text := regexp_replace(coalesce(_public_id, ''), '^(candidate|cand)', '', 'i');
  v_result jsonb;
BEGIN
  IF v_pid = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_candidate');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'candidate', jsonb_build_object(
      'id', c.id,
      'public_id', c.public_id,
      'project_id', c.project_id,
      'company_id', c.company_id,
      'role_name', c.role_name,
      'current_stage', c.current_stage,
      'registered_via', c.registered_via,
      'resume_name', c.resume_name
    ),
    'project', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', p.id,
      'public_id', p.public_id,
      'slug', p.slug,
      'company_id', p.company_id,
      'employer_id', p.employer_id,
      'role_name', p.role_name,
      'salary_terms', p.salary_terms,
      'schedule_terms', p.schedule_terms,
      'motivation_text', p.motivation_text,
      'custom_wiki', p.custom_wiki,
      'logo_url', p.logo_url
    ) END,
    'company', CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', co.id,
      'public_id', co.public_id,
      'slug', co.slug,
      'name', co.name,
      'logo_url', co.logo_url
    ) END
  ) INTO v_result
  FROM public.candidates c
  LEFT JOIN public.projects p ON p.id = c.project_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.public_id = v_pid
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('ok', false, 'error', 'not_found'));
END $$;

REVOKE ALL ON FUNCTION public.candidate_public_cabinet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_public_cabinet(text) TO anon, authenticated;