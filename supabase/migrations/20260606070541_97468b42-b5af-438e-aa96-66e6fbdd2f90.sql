CREATE OR REPLACE FUNCTION public.candidate_public_cabinet(_public_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'email', c.email,
      'phone', c.phone,
      'project_id', c.project_id,
      'company_id', c.company_id,
      'role_name', c.role_name,
      'current_stage', c.current_stage,
      'registered_via', c.registered_via,
      'resume_name', c.resume_name,
      'resume_text', c.resume_text,
      'avatar_url', c.avatar_url,
      'resume_url', c.resume_url,
      'social_telegram', c.social_telegram,
      'social_whatsapp', c.social_whatsapp,
      'social_instagram', c.social_instagram,
      'social_vk', c.social_vk,
      'social_max', c.social_max,
      'social_setka', c.social_setka,
      'social_github', c.social_github
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
      'motivation_text_detail', p.motivation_text_detail,
      'custom_wiki', p.custom_wiki,
      'vacancy_text', p.vacancy_text,
      'company_text', p.company_text,
      'onboarding_text', p.onboarding_text,
      'payouts_text', p.payouts_text,
      'schedule_text', p.schedule_text,
      'team_text', p.team_text,
      'system_text', p.system_text,
      'tasks_activity_text', p.tasks_activity_text,
      'cabinet_tabs_text', p.cabinet_tabs_text,
      'training_prof_text', p.training_prof_text,
      'training_product_text', p.training_product_text,
      'training_system_text', p.training_system_text,
      'mission_text', p.mission_text,
      'stats', p.stats,
      'training_published', p.training_published,
      'training_intro_text', p.training_intro_text,
      'training_wiki_text', p.training_wiki_text,
      'training_regulations_text', p.training_regulations_text,
      'training_professional_text', p.training_professional_text,
      'training_systems_text', p.training_systems_text,
      'logo_url', p.logo_url
    ) END,
    'company', CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', co.id,
      'public_id', co.public_id,
      'slug', co.slug,
      'name', co.name,
      'logo_url', co.logo_url,
      'industry', co.industry,
      'website', co.website,
      'description_text', co.description_text,
      'products_text', co.products_text,
      'mission_text', co.mission_text,
      'about_text', co.about_text,
      'team_text', co.team_text,
      'payouts_text', co.payouts_text,
      'schedule_text', co.schedule_text,
      'system_text', co.system_text
    ) END,
    'employer_contacts', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
      'email', e.contact_email,
      'phone', e.contact_phone,
      'telegram', e.contact_telegram
    ) END
  ) INTO v_result
  FROM public.candidates c
  LEFT JOIN public.projects p ON p.id = c.project_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.employers e ON e.id = p.employer_id
  WHERE c.public_id = v_pid
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('ok', false, 'error', 'not_found'));
END
$function$;

GRANT EXECUTE ON FUNCTION public.candidate_public_cabinet(text) TO anon;
GRANT EXECUTE ON FUNCTION public.candidate_public_cabinet(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_public_cabinet(text) TO service_role;