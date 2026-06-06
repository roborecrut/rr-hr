
-- 1) stage column on training_blocks
ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'professional'
    CHECK (stage IN ('professional','product','system'));
CREATE INDEX IF NOT EXISTS idx_training_blocks_project_stage
  ON public.training_blocks(project_id, stage);

-- 2) training_stage_tests
CREATE TABLE IF NOT EXISTS public.training_stage_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('professional','product','system')),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  pass_score int NOT NULL DEFAULT 70,
  total_score int NOT NULL DEFAULT 100,
  ai_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_stage_tests TO authenticated;
GRANT ALL ON public.training_stage_tests TO service_role;
ALTER TABLE public.training_stage_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer manages own stage tests"
  ON public.training_stage_tests FOR ALL
  TO authenticated
  USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_training_stage_tests_updated
  BEFORE UPDATE ON public.training_stage_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) candidate_stage_progress
CREATE TABLE IF NOT EXISTS public.candidate_stage_progress (
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('professional','product','system')),
  attempts int NOT NULL DEFAULT 0,
  best_score int NOT NULL DEFAULT 0,
  last_score int,
  last_answers jsonb,
  last_feedback jsonb,
  passed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_stage_progress TO authenticated;
GRANT ALL ON public.candidate_stage_progress TO service_role;
ALTER TABLE public.candidate_stage_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate/employer/admin can view stage progress"
  ON public.candidate_stage_progress FOR SELECT
  TO authenticated
  USING (public.can_view_candidate(candidate_id));

CREATE POLICY "candidate/employer/admin can upsert stage progress"
  ON public.candidate_stage_progress FOR INSERT
  TO authenticated
  WITH CHECK (public.can_view_candidate(candidate_id));

CREATE POLICY "candidate/employer/admin can update stage progress"
  ON public.candidate_stage_progress FOR UPDATE
  TO authenticated
  USING (public.can_view_candidate(candidate_id))
  WITH CHECK (public.can_view_candidate(candidate_id));

CREATE TRIGGER trg_candidate_stage_progress_updated
  BEFORE UPDATE ON public.candidate_stage_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
