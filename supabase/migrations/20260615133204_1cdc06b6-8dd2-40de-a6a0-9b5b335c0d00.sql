-- Закрыть утечки полей с ответами и анонимный доступ к interview_blocks
-- 1) interview_blocks: добавить SELECT владельца/админа, удалить публичный USING(true)
CREATE POLICY "interview_blocks owner select"
  ON public.interview_blocks
  FOR SELECT
  TO authenticated
  USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "interview_blocks read all" ON public.interview_blocks;

-- 2) training_questions: удалить анонимный и публичный SELECT (поля expected_answer/explanation)
DROP POLICY IF EXISTS "public candidate cabinet can read training questions" ON public.training_questions;
DROP POLICY IF EXISTS "training_questions_public_read" ON public.training_questions;

-- 3) training_quizzes: удалить анонимный SELECT с сырой таблицы (есть безопасный view public_training_quizzes)
DROP POLICY IF EXISTS "public candidate cabinet can read training quizzes" ON public.training_quizzes;