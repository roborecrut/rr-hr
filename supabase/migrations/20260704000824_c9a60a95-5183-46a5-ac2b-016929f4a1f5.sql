CREATE TABLE IF NOT EXISTS public.candidate_training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('professional','product','system')),
  attempt_no int NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 100,
  pass_score numeric NOT NULL DEFAULT 70,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
  protalk_chat_id text,
  protalk_social_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.candidate_training_attempts TO authenticated;
GRANT ALL ON public.candidate_training_attempts TO service_role;

ALTER TABLE public.candidate_training_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate training attempts visible to candidate/employer/admin"
ON public.candidate_training_attempts
FOR SELECT
TO authenticated
USING (public.can_view_candidate(candidate_id));

CREATE INDEX IF NOT EXISTS idx_candidate_training_attempts_candidate_project
ON public.candidate_training_attempts(candidate_id, project_id, stage, created_at DESC);