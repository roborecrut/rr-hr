ALTER TABLE public.training_stage_tests
  ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT true;
