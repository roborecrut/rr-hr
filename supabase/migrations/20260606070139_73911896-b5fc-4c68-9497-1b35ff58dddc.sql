ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS social_telegram text,
  ADD COLUMN IF NOT EXISTS social_whatsapp text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_vk text,
  ADD COLUMN IF NOT EXISTS social_max text,
  ADD COLUMN IF NOT EXISTS social_setka text,
  ADD COLUMN IF NOT EXISTS social_github text;

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
      'custom_wiki', p.custom_wiki,
      'logo_url', p.logo_url,
      'interview_pass_score', p.interview_pass_score,
      'training_pass_score', p.training_pass_score
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

GRANT SELECT ON public.projects TO anon;
GRANT SELECT ON public.companies TO anon;
GRANT SELECT ON public.training_blocks TO anon;
GRANT SELECT ON public.training_lessons TO anon;
GRANT SELECT ON public.training_quizzes TO anon;
GRANT SELECT ON public.training_questions TO anon;
GRANT SELECT ON public.candidate_scores TO anon;
GRANT SELECT, INSERT, UPDATE ON public.candidate_scores TO anon;
GRANT SELECT ON public.candidate_stage_progress TO anon;
GRANT SELECT, INSERT, UPDATE ON public.candidate_stage_progress TO anon;
GRANT SELECT ON public.candidate_training_progress TO anon;
GRANT SELECT, INSERT, UPDATE ON public.candidate_training_progress TO anon;
GRANT SELECT ON public.certifications TO anon;
GRANT SELECT, INSERT, UPDATE ON public.certifications TO anon;
GRANT SELECT ON public.interviews TO anon;
GRANT SELECT, INSERT, UPDATE ON public.interviews TO anon;
GRANT SELECT ON public.interview_messages TO anon;
GRANT SELECT, INSERT ON public.interview_messages TO anon;
GRANT SELECT ON public.candidate_answers TO anon;
GRANT SELECT, INSERT, UPDATE ON public.candidate_answers TO anon;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_blocks' AND policyname='public candidate cabinet can read training blocks') THEN
    CREATE POLICY "public candidate cabinet can read training blocks" ON public.training_blocks FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_lessons' AND policyname='public candidate cabinet can read training lessons') THEN
    CREATE POLICY "public candidate cabinet can read training lessons" ON public.training_lessons FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_quizzes' AND policyname='public candidate cabinet can read training quizzes') THEN
    CREATE POLICY "public candidate cabinet can read training quizzes" ON public.training_quizzes FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='training_questions' AND policyname='public candidate cabinet can read training questions') THEN
    CREATE POLICY "public candidate cabinet can read training questions" ON public.training_questions FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='candidate_scores' AND policyname='public candidate cabinet can manage scores') THEN
    CREATE POLICY "public candidate cabinet can manage scores" ON public.candidate_scores FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='candidate_stage_progress' AND policyname='public candidate cabinet can manage stage progress') THEN
    CREATE POLICY "public candidate cabinet can manage stage progress" ON public.candidate_stage_progress FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='candidate_training_progress' AND policyname='public candidate cabinet can manage training progress') THEN
    CREATE POLICY "public candidate cabinet can manage training progress" ON public.candidate_training_progress FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='certifications' AND policyname='public candidate cabinet can manage certifications') THEN
    CREATE POLICY "public candidate cabinet can manage certifications" ON public.certifications FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interviews' AND policyname='public candidate cabinet can manage interviews') THEN
    CREATE POLICY "public candidate cabinet can manage interviews" ON public.interviews FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_messages' AND policyname='public candidate cabinet can manage interview messages') THEN
    CREATE POLICY "public candidate cabinet can manage interview messages" ON public.interview_messages FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='candidate_answers' AND policyname='public candidate cabinet can manage answers') THEN
    CREATE POLICY "public candidate cabinet can manage answers" ON public.candidate_answers FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;