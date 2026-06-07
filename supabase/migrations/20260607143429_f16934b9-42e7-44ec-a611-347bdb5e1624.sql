
ALTER TABLE public.training_stage_tests ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT true;

-- Dedupe training_blocks: keep latest per (project_id, stage)
DELETE FROM public.training_blocks tb
USING public.training_blocks tb2
WHERE tb.project_id = tb2.project_id
  AND tb.stage = tb2.stage
  AND tb.ctid < tb2.ctid;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS training_blocks_project_stage_uniq
  ON public.training_blocks(project_id, stage);
