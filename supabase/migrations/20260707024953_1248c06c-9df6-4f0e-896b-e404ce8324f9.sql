
-- Helper: assemble candidate + project + employer context and insert notification.
CREATE OR REPLACE FUNCTION public.notify_employer_stage_event(
  _candidate_id uuid,
  _kind text,
  _stage_title text,
  _score_text text DEFAULT NULL,
  _dedup_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_emp_pid text;
  v_role text;
  v_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_tg text;
  v_attempt int;
  v_body text;
  v_contacts text;
  v_link text;
BEGIN
  SELECT e.user_id, e.public_id, p.role_name, co.name,
         COALESCE(NULLIF(c.full_name,''), NULLIF(c.resume_name,''), 'Кандидат'),
         c.email, c.phone, c.social_telegram
    INTO v_user, v_emp_pid, v_role, v_company, v_name, v_email, v_phone, v_tg
    FROM public.candidates c
    LEFT JOIN public.projects p ON p.id = c.project_id
    LEFT JOIN public.companies co ON co.id = p.company_id
    LEFT JOIN public.employers e ON e.id = p.employer_id
    WHERE c.id = _candidate_id;

  IF v_user IS NULL THEN RETURN; END IF;

  -- Attempt number = prior notifications of same kind for this candidate + 1
  SELECT COUNT(*) + 1 INTO v_attempt
    FROM public.notifications
   WHERE recipient_kind = 'employer'
     AND employer_user_id = v_user
     AND candidate_id = _candidate_id
     AND kind = _kind;

  v_contacts := trim(both ' · ' from
    COALESCE(v_email,'') ||
    CASE WHEN v_phone IS NOT NULL AND v_phone<>'' THEN ' · '||v_phone ELSE '' END ||
    CASE WHEN v_tg   IS NOT NULL AND v_tg<>''   THEN ' · TG '||v_tg ELSE '' END );

  v_body :=
    COALESCE(v_company,'—') || ' · ' || COALESCE(v_role,'—') || E'\n' ||
    v_name ||
    CASE WHEN _score_text IS NOT NULL THEN ' · ' || _score_text ELSE '' END ||
    CASE WHEN v_attempt > 1 THEN ' · попытка ' || v_attempt::text ELSE '' END ||
    CASE WHEN v_contacts <> '' THEN E'\n' || v_contacts ELSE '' END;

  v_link := CASE WHEN v_emp_pid IS NOT NULL THEN '/emp' || v_emp_pid || '/crm' ELSE NULL END;

  INSERT INTO public.notifications
    (recipient_kind, employer_user_id, candidate_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('employer', v_user, _candidate_id, _kind,
     _stage_title,
     v_body,
     v_link,
     jsonb_build_object(
       'candidate_id', _candidate_id,
       'candidate_name', v_name,
       'email', v_email,
       'phone', v_phone,
       'company', v_company,
       'role', v_role,
       'attempt_no', v_attempt,
       'score_text', _score_text
     ),
     COALESCE(_dedup_key, _kind || ':' || _candidate_id::text || ':' || v_attempt::text))
  ON CONFLICT DO NOTHING;
END $$;

-- 1) Candidate registered (first insert)
CREATE OR REPLACE FUNCTION public.notify_candidate_registered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_employer_stage_event(
    NEW.id, 'candidate_registered', 'Новый кандидат зарегистрировался',
    NULL, 'registered:' || NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_candidate_registered ON public.candidates;
CREATE TRIGGER trg_notify_candidate_registered
AFTER INSERT ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_registered();

-- 2/3/4) Screening / Checklist / Situations on candidate_scores change
CREATE OR REPLACE FUNCTION public.notify_candidate_stage_scored()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- resume screening
  IF NEW.resume_score IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.resume_score IS DISTINCT FROM NEW.resume_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_screening', 'Скрининг резюме пройден',
      'Резюме: ' || ROUND(NEW.resume_score)::text || '/100', NULL);
  END IF;

  -- checklist
  IF NEW.checklist_score IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.checklist_score IS DISTINCT FROM NEW.checklist_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_checklist', 'Чек-лист пройден',
      'Чек-лист: ' || ROUND(NEW.checklist_score)::text || '/100', NULL);
  END IF;

  -- situations
  IF NEW.situations_score IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.situations_score IS DISTINCT FROM NEW.situations_score) THEN
    PERFORM public.notify_employer_stage_event(
      NEW.candidate_id, 'stage_situations', 'Ситуационные вопросы пройдены',
      'Ситуации: ' || ROUND(NEW.situations_score)::text || '/100', NULL);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_candidate_stage_scored ON public.candidate_scores;
CREATE TRIGGER trg_notify_candidate_stage_scored
AFTER INSERT OR UPDATE OF resume_score, checklist_score, situations_score
ON public.candidate_scores
FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_stage_scored();

-- 5) Interview passing average score → already handled by notify_candidate_passed.
--    Ensure it fires only once via dedup key already based on candidate id.

-- 6/7/8) Training-stage tests: professional / product / systems
CREATE OR REPLACE FUNCTION public.notify_candidate_training_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text;
  v_title text;
  v_score_text text;
BEGIN
  IF NEW.stage NOT IN ('professional','product','systems') THEN
    RETURN NEW;
  END IF;

  v_kind := CASE NEW.stage
    WHEN 'professional' THEN 'stage_professional'
    WHEN 'product'      THEN 'stage_product'
    WHEN 'systems'      THEN 'stage_systems'
  END;
  v_title := CASE NEW.stage
    WHEN 'professional' THEN 'Проф-тест пройден'
    WHEN 'product'      THEN 'Продуктовый тест пройден'
    WHEN 'systems'      THEN 'Системный тест пройден'
  END;
  v_score_text := 'Балл: ' || COALESCE(NEW.score::text, '—')
                  || CASE WHEN NEW.total_score IS NOT NULL THEN '/'||NEW.total_score::text ELSE '' END
                  || CASE WHEN NEW.passed IS TRUE  THEN ' · ✓ сдал'
                          WHEN NEW.passed IS FALSE THEN ' · ✗ не сдал'
                          ELSE '' END;

  PERFORM public.notify_employer_stage_event(
    NEW.candidate_id, v_kind, v_title, v_score_text,
    v_kind || ':' || NEW.candidate_id::text || ':' || COALESCE(NEW.attempt_no,0)::text || ':' || NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_candidate_training_attempt ON public.candidate_training_attempts;
CREATE TRIGGER trg_notify_candidate_training_attempt
AFTER INSERT ON public.candidate_training_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_training_attempt();
