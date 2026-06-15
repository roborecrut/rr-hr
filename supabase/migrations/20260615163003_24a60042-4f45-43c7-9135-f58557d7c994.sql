
-- ============================================================
-- Helper: resolve candidate_id from x-candidate-token header
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_candidate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.candidate_id
    FROM public.candidate_sessions s
   WHERE s.token = NULLIF(
           COALESCE(
             current_setting('request.headers', true)::json->>'x-candidate-token',
             ''
           ), ''
         )::uuid
     AND (s.expires_at IS NULL OR s.expires_at > now())
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_candidate_id() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_candidate_project_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.project_id
    FROM public.candidates c
   WHERE c.id = public.current_candidate_id()
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_candidate_project_id() TO anon, authenticated, service_role;

-- ============================================================
-- 1) candidate_answers
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage answers" ON public.candidate_answers;
CREATE POLICY "cand cabinet token answers"
  ON public.candidate_answers
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 2) candidate_scores
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage scores" ON public.candidate_scores;
CREATE POLICY "cand cabinet token scores"
  ON public.candidate_scores
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 3) candidate_stage_progress
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage stage progress" ON public.candidate_stage_progress;
CREATE POLICY "cand cabinet token stage progress"
  ON public.candidate_stage_progress
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 4) candidate_training_progress
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage training progress" ON public.candidate_training_progress;
CREATE POLICY "cand cabinet token training progress"
  ON public.candidate_training_progress
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 5) certifications
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage certifications" ON public.certifications;
CREATE POLICY "cand cabinet token certifications"
  ON public.certifications
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 6) interviews
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage interviews" ON public.interviews;
CREATE POLICY "cand cabinet token interviews"
  ON public.interviews
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (candidate_id = public.current_candidate_id())
  WITH CHECK (candidate_id = public.current_candidate_id());

-- ============================================================
-- 7) interview_messages (linked via interviews.candidate_id)
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can manage interview messages" ON public.interview_messages;
CREATE POLICY "cand cabinet token interview messages"
  ON public.interview_messages
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.interviews i
     WHERE i.id = interview_messages.interview_id
       AND i.candidate_id = public.current_candidate_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.interviews i
     WHERE i.id = interview_messages.interview_id
       AND i.candidate_id = public.current_candidate_id()
  ));

-- ============================================================
-- 8) training_blocks — заменяем «всё доступно anon» на свой проект по токену
--    оставляем уже существующее чтение опубликованных вакансий "tb read pub"
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can read training blocks" ON public.training_blocks;
CREATE POLICY "cand cabinet token training blocks read"
  ON public.training_blocks
  AS PERMISSIVE
  FOR SELECT
  TO anon
  USING (project_id = public.current_candidate_project_id());

-- ============================================================
-- 9) training_lessons — то же самое через блоки
-- ============================================================
DROP POLICY IF EXISTS "public candidate cabinet can read training lessons" ON public.training_lessons;
CREATE POLICY "cand cabinet token training lessons read"
  ON public.training_lessons
  AS PERMISSIVE
  FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.training_blocks b
     WHERE b.id = training_lessons.block_id
       AND b.project_id = public.current_candidate_project_id()
  ));
