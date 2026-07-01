CREATE OR REPLACE FUNCTION public.candidate_scores_recompute_overall()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_sum numeric := 0;
  v_cnt int := 0;
BEGIN
  IF NEW.resume_score     IS NOT NULL AND NEW.resume_score     > 0 THEN v_sum := v_sum + NEW.resume_score;     v_cnt := v_cnt + 1; END IF;
  IF NEW.checklist_score  IS NOT NULL AND NEW.checklist_score  > 0 THEN v_sum := v_sum + NEW.checklist_score;  v_cnt := v_cnt + 1; END IF;
  IF NEW.situations_score IS NOT NULL AND NEW.situations_score > 0 THEN v_sum := v_sum + NEW.situations_score; v_cnt := v_cnt + 1; END IF;
  IF v_cnt > 0 THEN
    NEW.overall_score := round(v_sum / v_cnt, 2);
  ELSE
    NEW.overall_score := NULL;
  END IF;
  RETURN NEW;
END $function$;

UPDATE public.candidate_scores SET updated_at = now();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.candidate_scores;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.candidate_scores REPLICA IDENTITY FULL;