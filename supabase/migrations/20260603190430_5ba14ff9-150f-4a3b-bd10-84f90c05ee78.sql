
-- project_questions: hide correct_answer/explanation from public reads
DROP POLICY IF EXISTS "pq read published" ON public.project_questions;
DROP POLICY IF EXISTS "pq read auth" ON public.project_questions;
CREATE POLICY "pq read owner" ON public.project_questions FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE VIEW public.public_project_questions
WITH (security_invoker = false) AS
SELECT id, project_id, category, order_index, type, question, options,
       material_title, material_content, created_at
FROM public.project_questions
WHERE public.is_project_published(project_id);

GRANT SELECT ON public.public_project_questions TO anon, authenticated;

-- training_quizzes: hide correct_answer/explanation from public reads
DROP POLICY IF EXISTS "tq read pub" ON public.training_quizzes;
DROP POLICY IF EXISTS "tq read auth" ON public.training_quizzes;
CREATE POLICY "tq read owner" ON public.training_quizzes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_lessons l
    JOIN public.training_blocks b ON b.id = l.block_id
    WHERE l.id = training_quizzes.lesson_id
      AND (public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin'))
  ));

CREATE OR REPLACE VIEW public.public_training_quizzes
WITH (security_invoker = false) AS
SELECT q.id, q.lesson_id, q.type, q.question, q.options, q.order_index, q.created_at
FROM public.training_quizzes q
JOIN public.training_lessons l ON l.id = q.lesson_id
JOIN public.training_blocks b ON b.id = l.block_id
WHERE public.is_project_published(b.project_id);

GRANT SELECT ON public.public_training_quizzes TO anon, authenticated;

-- referrals: remove blanket anon SELECT, add safe lookup function
DROP POLICY IF EXISTS "ref public lookup by code" ON public.referrals;

CREATE OR REPLACE FUNCTION public.referral_lookup(_code text)
RETURNS TABLE(ref_code text, owner_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ref_code, owner_user_id FROM public.referrals WHERE ref_code = _code LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.referral_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_lookup(text) TO anon, authenticated;

-- profiles: remove anon SELECT
DROP POLICY IF EXISTS "profiles public select basic" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- ai_runs: include candidate_id check
DROP POLICY IF EXISTS "ai_runs admin" ON public.ai_runs;
CREATE POLICY "ai_runs read" ON public.ai_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR user_id = auth.uid()
    OR (employer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employers e WHERE e.id = ai_runs.employer_id AND e.user_id = auth.uid()
    ))
    OR (candidate_id IS NOT NULL AND public.can_view_candidate(candidate_id))
  );

-- candidate_stages_history: admin-only updates/deletes
CREATE POLICY "csh update admin" ON public.candidate_stages_history FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "csh delete admin" ON public.candidate_stages_history FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Restrict sensitive SECURITY DEFINER functions from direct API calls
REVOKE EXECUTE ON FUNCTION public.apply_transaction(uuid, public.tx_type, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_on_tg_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_employer_bonus() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- test_connection: deny-by-default policy
CREATE POLICY "test_connection deny" ON public.test_connection FOR SELECT TO anon, authenticated USING (false);
