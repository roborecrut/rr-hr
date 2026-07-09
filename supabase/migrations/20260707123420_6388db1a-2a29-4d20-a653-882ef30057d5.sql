-- Fix: score columns in candidate_scores must be NULL by default, not 0.
-- With DEFAULT 0 any failed stage grading (or partial insert) left checklist_score=0
-- with no feedback. Frontend then treats "0" as scored and shows an empty
-- "Подробный разбор ещё не сформирован" block. Overall_score got recomputed with
-- garbage. Migration removes the defaults and backfills stale zeros to NULL.

ALTER TABLE public.candidate_scores
  ALTER COLUMN resume_score      DROP DEFAULT,
  ALTER COLUMN checklist_score   DROP DEFAULT,
  ALTER COLUMN situations_score  DROP DEFAULT,
  ALTER COLUMN overall_score     DROP DEFAULT;

-- Backfill: zeros that have no accompanying feedback are unscored, not "0/100".
UPDATE public.candidate_scores
SET checklist_score = NULL
WHERE checklist_score = 0
  AND checklist_feedback IS NULL
  AND candidate_checklist_feedback IS NULL;

UPDATE public.candidate_scores
SET situations_score = NULL
WHERE situations_score = 0
  AND situations_feedback IS NULL
  AND candidate_situations_feedback IS NULL;

UPDATE public.candidate_scores
SET resume_score = NULL
WHERE resume_score = 0
  AND resume_feedback IS NULL
  AND candidate_resume_feedback IS NULL;

-- Re-derive overall_score using the same rule as the trigger
-- (`> 0` guard so lingering zero values on other rows do not skew averages).
UPDATE public.candidate_scores cs
SET overall_score = sub.avg_score
FROM (
  SELECT candidate_id,
    CASE
      WHEN (CASE WHEN resume_score     > 0 THEN 1 ELSE 0 END
          + CASE WHEN checklist_score  > 0 THEN 1 ELSE 0 END
          + CASE WHEN situations_score > 0 THEN 1 ELSE 0 END) > 0
      THEN ROUND(
        (COALESCE(NULLIF(resume_score,     0), 0)
       + COALESCE(NULLIF(checklist_score,  0), 0)
       + COALESCE(NULLIF(situations_score, 0), 0))
       /
        (CASE WHEN resume_score     > 0 THEN 1 ELSE 0 END
       + CASE WHEN checklist_score  > 0 THEN 1 ELSE 0 END
       + CASE WHEN situations_score > 0 THEN 1 ELSE 0 END)::numeric, 2)
      ELSE NULL
    END AS avg_score
  FROM public.candidate_scores
) sub
WHERE cs.candidate_id = sub.candidate_id
  AND (cs.overall_score IS DISTINCT FROM sub.avg_score);
