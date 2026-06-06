
-- Iteration 3: Training materials + tests schema.

-- 1) Extend training_blocks with material content, files/links and score config.
ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS block_key TEXT,                  -- 'professional'|'product'|'systems'|'wiki'|'regulations'
  ADD COLUMN IF NOT EXISTS materials_md TEXT,               -- markdown content (employer-editable)
  ADD COLUMN IF NOT EXISTS materials_links JSONB DEFAULT '[]'::jsonb,  -- [{title,url,kind}]
  ADD COLUMN IF NOT EXISTS materials_files JSONB DEFAULT '[]'::jsonb,  -- [{name,path,mime,size}]
  ADD COLUMN IF NOT EXISTS pass_score INT,                  -- threshold to pass (in points)
  ADD COLUMN IF NOT EXISTS total_score INT,                 -- sum of all question points (cached)
  ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS training_blocks_project_block_key_idx
  ON public.training_blocks (project_id, block_key);

-- updated_at trigger (reuse set_updated_at if exists).
DROP TRIGGER IF EXISTS training_blocks_set_updated_at ON public.training_blocks;
CREATE TRIGGER training_blocks_set_updated_at
  BEFORE UPDATE ON public.training_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Per-block test questions.
CREATE TABLE IF NOT EXISTS public.training_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id    UUID NOT NULL REFERENCES public.training_blocks(id) ON DELETE CASCADE,
  order_no    INT  NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL CHECK (kind IN ('choice','text')),
  question    TEXT NOT NULL,
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- choice: [{text, is_correct}]
  expected_answer TEXT,                            -- text: reference answer for ProTalk
  points      INT NOT NULL DEFAULT 1,
  explanation TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_questions TO authenticated;
GRANT SELECT ON public.training_questions TO anon;
GRANT ALL ON public.training_questions TO service_role;

ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;

-- Employers (project owners) and admins can fully manage questions.
CREATE POLICY "training_questions_owner_all"
  ON public.training_questions
  FOR ALL
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.training_blocks tb
      WHERE tb.id = block_id AND public.is_project_owner(tb.project_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.training_blocks tb
      WHERE tb.id = block_id AND public.is_project_owner(tb.project_id)
    )
  );

-- Public read access for candidates studying a published vacancy (mirror block visibility).
CREATE POLICY "training_questions_public_read"
  ON public.training_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_blocks tb
      WHERE tb.id = block_id AND public.is_project_published(tb.project_id)
    )
  );

DROP TRIGGER IF EXISTS training_questions_set_updated_at ON public.training_questions;
CREATE TRIGGER training_questions_set_updated_at
  BEFORE UPDATE ON public.training_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS training_questions_block_order_idx
  ON public.training_questions (block_id, order_no);

-- 3) Extend candidate_training_progress with score/answers if missing.
ALTER TABLE public.candidate_training_progress
  ADD COLUMN IF NOT EXISTS score INT,
  ADD COLUMN IF NOT EXISTS passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
