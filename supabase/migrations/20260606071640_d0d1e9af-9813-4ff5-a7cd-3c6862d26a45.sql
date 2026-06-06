ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS full_name text;

CREATE OR REPLACE FUNCTION public.candidate_email_signup(
  _email text,
  _password text,
  _project uuid,
  _company uuid DEFAULT NULL::uuid,
  _phone text DEFAULT NULL::text,
  _full_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_email text := lower(trim(_email));
  v_full_name text := NULLIF(btrim(COALESCE(_full_name, '')), '');
  v_role text;
  v_company uuid := _company;
  v_existing public.candidates;
  v_cand public.candidates;
  v_token uuid;
  v_hash text;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_email');
  END IF;
  IF _password IS NULL OR length(_password) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_password');
  END IF;
  IF _project IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF v_full_name IS NULL OR char_length(v_full_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_full_name');
  END IF;

  SELECT role_name, company_id INTO v_role, v_company
    FROM public.projects WHERE id = _project;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_project');
  END IF;
  IF _company IS NOT NULL THEN v_company := _company; END IF;

  SELECT * INTO v_existing FROM public.candidates
    WHERE lower(email) = v_email AND project_id = _project
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.password_hash IS NULL OR v_existing.password_hash <> extensions.crypt(_password, v_existing.password_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
    UPDATE public.candidates SET
      last_login_at = now(),
      phone = COALESCE(NULLIF(_phone, ''), phone),
      full_name = COALESCE(v_full_name, full_name)
    WHERE id = v_existing.id;
    INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_existing.id)
      RETURNING token INTO v_token;
    RETURN jsonb_build_object('ok', true, 'candidate_id', v_existing.id,
      'public_id', v_existing.public_id, 'project_id', v_existing.project_id,
      'company_id', v_existing.company_id, 'token', v_token, 'already', true,
      'full_name', COALESCE(v_full_name, v_existing.full_name));
  END IF;

  SELECT password_hash INTO v_hash FROM public.candidates
    WHERE lower(email) = v_email AND password_hash IS NOT NULL
    LIMIT 1;
  IF v_hash IS NOT NULL THEN
    IF v_hash <> extensions.crypt(_password, v_hash) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wrong_password');
    END IF;
  ELSE
    v_hash := extensions.crypt(_password, extensions.gen_salt('bf'));
  END IF;

  INSERT INTO public.candidates (
    email, password_hash, project_id, company_id,
    role_name, registered_via, current_stage, auth_kind, phone, full_name
  ) VALUES (
    v_email, v_hash, _project, v_company, v_role,
    'email'::public.registration_method,
    'terms'::public.candidate_stage,
    'email', NULLIF(_phone, ''), v_full_name
  ) RETURNING * INTO v_cand;

  INSERT INTO public.candidate_sessions (candidate_id) VALUES (v_cand.id)
    RETURNING token INTO v_token;

  RETURN jsonb_build_object('ok', true, 'candidate_id', v_cand.id,
    'public_id', v_cand.public_id, 'project_id', v_cand.project_id,
    'company_id', v_cand.company_id, 'token', v_token, 'full_name', v_cand.full_name);
END
$function$;

GRANT EXECUTE ON FUNCTION public.candidate_email_signup(text, text, uuid, uuid, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_public_cabinet(_public_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
      'full_name', c.full_name,
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

GRANT EXECUTE ON FUNCTION public.candidate_public_cabinet(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_candidates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'public_id', c.public_id, 'full_name', c.full_name, 'email', c.email,
    'phone', c.phone, 'role_name', c.role_name, 'crm_stage', c.crm_stage, 'current_stage', c.current_stage,
    'created_at', c.created_at,
    'project_id', c.project_id, 'company_id', c.company_id,
    'company_name', co.name, 'project_role', pr.role_name,
    'overall_score', s.overall_score
  ) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v
  FROM public.candidates c
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects pr ON pr.id = c.project_id
  LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id;
  RETURN v;
END
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_candidates() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_full_details(_candidate uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (public.can_view_candidate(_candidate) OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'candidate', to_jsonb(c.*),
    'profile', to_jsonb(p.*),
    'company', to_jsonb(co.*),
    'project', to_jsonb(pr.*),
    'scores', to_jsonb(s.*),
    'answers', COALESCE((SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at) FROM public.candidate_answers a WHERE a.candidate_id = c.id), '[]'::jsonb),
    'stage_progress', COALESCE((SELECT jsonb_agg(to_jsonb(sp.*) ORDER BY sp.created_at) FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id), '[]'::jsonb),
    'training_progress', COALESCE((SELECT jsonb_agg(to_jsonb(tp.*) ORDER BY tp.created_at) FROM public.candidate_training_progress tp WHERE tp.candidate_id = c.id), '[]'::jsonb),
    'interviews', COALESCE((SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at) FROM public.interviews i WHERE i.candidate_id = c.id), '[]'::jsonb)
  ) INTO v
  FROM public.candidates c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects pr ON pr.id = c.project_id
  LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
  WHERE c.id = _candidate;
  RETURN v;
END
$function$;

GRANT EXECUTE ON FUNCTION public.candidate_full_details(uuid) TO authenticated, service_role;