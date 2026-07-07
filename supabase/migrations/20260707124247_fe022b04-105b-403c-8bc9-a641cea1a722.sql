-- 1) Fix notification trigger: only notify when score is meaningful.
CREATE OR REPLACE FUNCTION public.notify_candidate_stage_scored()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.resume_score IS NOT NULL AND NEW.resume_score > 0
     AND (NEW.resume_feedback IS NOT NULL OR NEW.candidate_resume_feedback IS NOT NULL)
     AND (TG_OP='INSERT' OR OLD.resume_score IS DISTINCT FROM NEW.resume_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_screening', 'Скрининг резюме пройден',
      'Резюме: ' || ROUND(NEW.resume_score)::text || '/100', NULL);
  END IF;

  IF NEW.checklist_score IS NOT NULL AND NEW.checklist_score > 0
     AND (NEW.checklist_feedback IS NOT NULL OR NEW.candidate_checklist_feedback IS NOT NULL)
     AND (TG_OP='INSERT' OR OLD.checklist_score IS DISTINCT FROM NEW.checklist_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_checklist', 'Чек-лист пройден',
      'Чек-лист: ' || ROUND(NEW.checklist_score)::text || '/100', NULL);
  END IF;

  IF NEW.situations_score IS NOT NULL AND NEW.situations_score > 0
     AND (NEW.situations_feedback IS NOT NULL OR NEW.candidate_situations_feedback IS NOT NULL)
     AND (TG_OP='INSERT' OR OLD.situations_score IS DISTINCT FROM NEW.situations_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_situations', 'Ситуационные вопросы пройдены',
      'Ситуации: ' || ROUND(NEW.situations_score)::text || '/100', NULL);
  END IF;

  RETURN NEW;
END $$;

-- 2) Remove already-sent false 0/100 notifications.
DELETE FROM public.notifications
WHERE kind IN ('stage_checklist','stage_situations')
  AND (meta->>'score_text' IN ('Чек-лист: 0/100','Ситуации: 0/100')
       OR body IN ('Чек-лист: 0/100','Ситуации: 0/100'));

-- 3) Watchdog schedule
DO $$
BEGIN
  PERFORM cron.unschedule('ai_job_watchdog_tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ai_job_watchdog_tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/ai-job-watchdog',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
