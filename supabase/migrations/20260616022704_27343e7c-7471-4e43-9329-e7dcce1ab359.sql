
-- ============================================================
-- 1. notifications table
-- ============================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('employer','candidate')),
  employer_user_id uuid NULL,
  candidate_id uuid NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (recipient_kind = 'employer' AND employer_user_id IS NOT NULL AND candidate_id IS NULL)
    OR (recipient_kind = 'candidate' AND candidate_id IS NOT NULL AND employer_user_id IS NULL)
  )
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO anon;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_emp_select ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_kind='employer' AND employer_user_id = auth.uid());

CREATE POLICY notif_emp_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_kind='employer' AND employer_user_id = auth.uid())
  WITH CHECK (recipient_kind='employer' AND employer_user_id = auth.uid());

CREATE POLICY notif_cand_select ON public.notifications
  FOR SELECT TO anon, authenticated
  USING (recipient_kind='candidate' AND candidate_id = public.current_candidate_id());

CREATE POLICY notif_cand_update ON public.notifications
  FOR UPDATE TO anon, authenticated
  USING (recipient_kind='candidate' AND candidate_id = public.current_candidate_id())
  WITH CHECK (recipient_kind='candidate' AND candidate_id = public.current_candidate_id());

CREATE INDEX notif_emp_idx ON public.notifications (employer_user_id, created_at DESC)
  WHERE recipient_kind='employer';
CREATE INDEX notif_cand_idx ON public.notifications (candidate_id, created_at DESC)
  WHERE recipient_kind='candidate';
CREATE UNIQUE INDEX notif_dedup_emp ON public.notifications (employer_user_id, kind, dedup_key)
  WHERE recipient_kind='employer' AND dedup_key IS NOT NULL;
CREATE UNIQUE INDEX notif_dedup_cand ON public.notifications (candidate_id, kind, dedup_key)
  WHERE recipient_kind='candidate' AND dedup_key IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- 2. candidates / projects new columns
-- ============================================================
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS hire_decision text NULL CHECK (hire_decision IN ('invited','rejected')),
  ADD COLUMN IF NOT EXISTS hire_decided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS hire_message text NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS notify_score_threshold int NOT NULL DEFAULT 70;

-- ============================================================
-- 3. RPC: list / mark read
-- ============================================================
CREATE OR REPLACE FUNCTION public.notifications_list(_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cand uuid := public.current_candidate_id();
  v_items jsonb := '[]'::jsonb;
  v_unread int := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(n.*) ORDER BY n.created_at DESC), '[]'::jsonb)
      INTO v_items
      FROM (SELECT * FROM public.notifications
             WHERE recipient_kind='employer' AND employer_user_id = v_uid
             ORDER BY created_at DESC LIMIT _limit) n;
    SELECT count(*) INTO v_unread
      FROM public.notifications
      WHERE recipient_kind='employer' AND employer_user_id = v_uid AND read_at IS NULL;
    RETURN jsonb_build_object('viewer','employer','items', v_items, 'unread', v_unread);
  ELSIF v_cand IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(n.*) ORDER BY n.created_at DESC), '[]'::jsonb)
      INTO v_items
      FROM (SELECT * FROM public.notifications
             WHERE recipient_kind='candidate' AND candidate_id = v_cand
             ORDER BY created_at DESC LIMIT _limit) n;
    SELECT count(*) INTO v_unread
      FROM public.notifications
      WHERE recipient_kind='candidate' AND candidate_id = v_cand AND read_at IS NULL;
    RETURN jsonb_build_object('viewer','candidate','items', v_items, 'unread', v_unread);
  END IF;
  RETURN jsonb_build_object('viewer', null, 'items', '[]'::jsonb, 'unread', 0);
END $$;

CREATE OR REPLACE FUNCTION public.notifications_mark_read(_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cand uuid := public.current_candidate_id();
  v_n int := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_kind='employer' AND employer_user_id = v_uid
       AND read_at IS NULL
       AND (_ids IS NULL OR id = ANY(_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_cand IS NOT NULL THEN
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_kind='candidate' AND candidate_id = v_cand
       AND read_at IS NULL
       AND (_ids IS NULL OR id = ANY(_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated', v_n);
END $$;

-- ============================================================
-- 4. Trigger: passing score → notify employer
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_candidate_passed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold int;
  v_proj uuid;
  v_role text;
  v_name text;
  v_cand_pid text;
  v_user uuid;
  v_proj_pid text;
BEGIN
  IF NEW.overall_score IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.overall_score IS NOT NULL
     AND OLD.overall_score = NEW.overall_score THEN RETURN NEW; END IF;

  SELECT c.project_id, c.full_name, c.public_id, p.notify_score_threshold, e.user_id, p.public_id
    INTO v_proj, v_name, v_cand_pid, v_threshold, v_user, v_proj_pid
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    JOIN public.employers e ON e.id = p.employer_id
    WHERE c.id = NEW.candidate_id;

  IF v_user IS NULL THEN RETURN NEW; END IF;
  IF NEW.overall_score < COALESCE(v_threshold, 70) THEN RETURN NEW; END IF;

  INSERT INTO public.notifications
    (recipient_kind, employer_user_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('employer', v_user, 'candidate_passed',
     'Новый подходящий кандидат',
     COALESCE(NULLIF(v_name,''), 'Кандидат') || ' прошёл интервью с баллом ' || NEW.overall_score::text || '/100',
     '/employer?candidate=' || COALESCE(v_cand_pid, NEW.candidate_id::text),
     jsonb_build_object('candidate_id', NEW.candidate_id, 'project_id', v_proj, 'score', NEW.overall_score),
     'cand:' || NEW.candidate_id::text)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_candidate_passed ON public.candidate_scores;
CREATE TRIGGER trg_notify_candidate_passed
  AFTER INSERT OR UPDATE OF overall_score ON public.candidate_scores
  FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_passed();

-- ============================================================
-- 5. Trigger: certification → notify employer
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_candidate_certified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_name text;
  v_cand_pid text;
BEGIN
  SELECT e.user_id, c.full_name, c.public_id
    INTO v_user, v_name, v_cand_pid
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    JOIN public.employers e ON e.id = p.employer_id
    WHERE c.id = NEW.candidate_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications
    (recipient_kind, employer_user_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('employer', v_user, 'candidate_certified',
     'Кандидат готов к найму',
     COALESCE(NULLIF(v_name,''),'Кандидат') || ' завершил обучение и получил сертификат',
     '/employer?candidate=' || COALESCE(v_cand_pid, NEW.candidate_id::text),
     jsonb_build_object('candidate_id', NEW.candidate_id),
     'cand:' || NEW.candidate_id::text)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_candidate_certified ON public.certifications;
CREATE TRIGGER trg_notify_candidate_certified
  AFTER INSERT ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_certified();

-- ============================================================
-- 6. RPC: employer hire decision
-- ============================================================
CREATE OR REPLACE FUNCTION public.candidate_invite_decision(_candidate uuid, _decision text, _message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_emp_user uuid;
  v_name text;
  v_comp text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _decision NOT IN ('invited','rejected') THEN RAISE EXCEPTION 'bad_decision'; END IF;

  SELECT e.user_id, c.full_name, COALESCE(co.name, e.company_name)
    INTO v_emp_user, v_name, v_comp
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    JOIN public.employers e ON e.id = p.employer_id
    LEFT JOIN public.companies co ON co.id = c.company_id
    WHERE c.id = _candidate;
  IF v_emp_user IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_emp_user <> v_user AND NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.candidates
     SET hire_decision = _decision,
         hire_decided_at = now(),
         hire_message = _message,
         updated_at = now()
   WHERE id = _candidate;

  INSERT INTO public.notifications
    (recipient_kind, candidate_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('candidate', _candidate,
     CASE WHEN _decision='invited' THEN 'candidate_invited' ELSE 'candidate_rejected' END,
     CASE WHEN _decision='invited' THEN 'Вас пригласили на работу' ELSE 'Решение по вашей кандидатуре' END,
     CASE WHEN _decision='invited'
          THEN 'Работодатель ' || COALESCE(v_comp,'') || ' ждёт вас. Откройте сообщение в кабинете.'
          ELSE 'Работодатель ' || COALESCE(v_comp,'') || ' принял решение по вашей кандидатуре.' END,
     '/candidate',
     jsonb_build_object('decision', _decision, 'message', _message),
     'decision:' || now()::text)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- 7. RPC: reminders (called by pg_cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notifications_run_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_n int;
BEGIN
  -- employer_company_empty_24h
  INSERT INTO public.notifications
    (recipient_kind, employer_user_id, kind, title, body, link, dedup_key)
  SELECT 'employer', e.user_id, 'employer_company_empty_24h',
         'Допишите компанию',
         'Без описания компании кандидаты не пойдут. Это 5 минут.',
         '/employer',
         'once'
    FROM public.employers e
   WHERE e.user_id IS NOT NULL
     AND e.created_at < now() - interval '24 hours'
     AND NOT EXISTS (
       SELECT 1 FROM public.companies c
        WHERE c.owner_employer_id = e.id
          AND c.status = 'active'
          AND COALESCE(NULLIF(trim(c.name),''), NULL) IS NOT NULL
     )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_inserted := v_inserted + v_n;

  -- employer_no_vacancy_48h
  INSERT INTO public.notifications
    (recipient_kind, employer_user_id, kind, title, body, link, dedup_key)
  SELECT 'employer', e.user_id, 'employer_no_vacancy_48h',
         'Опубликуйте первую вакансию',
         'Компания готова — добавьте вакансию, чтобы начать получать отклики.',
         '/employer',
         'once'
    FROM public.employers e
   WHERE e.user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.companies c
        WHERE c.owner_employer_id = e.id
          AND c.status = 'active'
          AND c.created_at < now() - interval '48 hours'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.projects p
        WHERE p.employer_id = e.id AND p.status = 'active'
     )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_inserted := v_inserted + v_n;

  -- candidate_interview_abandoned_24h
  INSERT INTO public.notifications
    (recipient_kind, candidate_id, kind, title, body, link, dedup_key)
  SELECT 'candidate', c.id, 'candidate_interview_abandoned_24h',
         'Завершите интервью',
         'Вы остановились на интервью. Вернитесь и закончите — это 10 минут.',
         '/candidate',
         'once'
    FROM public.candidates c
   WHERE c.created_at < now() - interval '24 hours'
     AND c.created_at > now() - interval '14 days'
     AND NOT EXISTS (SELECT 1 FROM public.candidate_scores s WHERE s.candidate_id = c.id AND s.overall_score IS NOT NULL)
     AND (
       EXISTS (SELECT 1 FROM public.candidate_answers a WHERE a.candidate_id = c.id)
       OR EXISTS (SELECT 1 FROM public.interview_messages m
                   JOIN public.interviews i ON i.id = m.interview_id
                   WHERE i.candidate_id = c.id)
     )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_inserted := v_inserted + v_n;

  -- candidate_training_abandoned_48h
  INSERT INTO public.notifications
    (recipient_kind, candidate_id, kind, title, body, link, dedup_key)
  SELECT 'candidate', c.id, 'candidate_training_abandoned_48h',
         'Закончите обучение',
         'Без сертификата работодатель не увидит вас как готового. Допройдите обучение.',
         '/candidate',
         'once'
    FROM public.candidates c
   WHERE EXISTS (SELECT 1 FROM public.candidate_training_progress t
                  WHERE t.candidate_id = c.id
                    AND t.updated_at < now() - interval '48 hours')
     AND NOT EXISTS (SELECT 1 FROM public.certifications cert WHERE cert.candidate_id = c.id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_inserted := v_inserted + v_n;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'at', now());
END $$;

-- ============================================================
-- 8. pg_cron schedule every 30 min
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='notifications_run_reminders') THEN
    PERFORM cron.unschedule('notifications_run_reminders');
  END IF;
  PERFORM cron.schedule(
    'notifications_run_reminders',
    '*/30 * * * *',
    $cron$ SELECT public.notifications_run_reminders(); $cron$
  );
END $$;
