
-- Create interview_blocks table used by InterviewWizard + edge functions
CREATE TABLE IF NOT EXISTS public.interview_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('resume','checklist','situations')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind)
);

GRANT SELECT ON public.interview_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_blocks TO authenticated;
GRANT ALL ON public.interview_blocks TO service_role;

ALTER TABLE public.interview_blocks ENABLE ROW LEVEL SECURITY;

-- Public read (vacancy interview data is shown to candidates without auth on cabinet)
CREATE POLICY "interview_blocks read all"
  ON public.interview_blocks FOR SELECT
  USING (true);

-- Project owner (employer) or admin can write
CREATE POLICY "interview_blocks owner write"
  ON public.interview_blocks FOR INSERT
  WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "interview_blocks owner update"
  ON public.interview_blocks FOR UPDATE
  USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "interview_blocks owner delete"
  ON public.interview_blocks FOR DELETE
  USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER trg_interview_blocks_updated_at
  BEFORE UPDATE ON public.interview_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pass score column referenced by InterviewWizard
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS interview_pass_score integer NOT NULL DEFAULT 75;
