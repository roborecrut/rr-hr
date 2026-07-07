
CREATE OR REPLACE FUNCTION public.candidate_invite_decision(_candidate uuid, _decision text, _message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_emp_user uuid;
  v_comp text;
  v_label text;
  v_body text;
  v_msg text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _decision NOT IN ('invited','rejected','review') THEN RAISE EXCEPTION 'bad_decision'; END IF;

  SELECT e.user_id, COALESCE(co.name, e.company_name)
    INTO v_emp_user, v_comp
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

  v_label := CASE
    WHEN _decision='invited'  THEN 'Решение работодателя: приглашение на работу.'
    WHEN _decision='review'   THEN 'Решение работодателя: ваша кандидатура на рассмотрении.'
    ELSE                           'Решение работодателя: отказ по вашей кандидатуре.'
  END;

  v_msg := NULLIF(btrim(COALESCE(_message, '')), '');
  v_body := 'Работодатель' || COALESCE(' ' || v_comp, '') || '. ' || v_label
            || CASE WHEN v_msg IS NOT NULL
                    THEN E'\n\nСообщение работодателя:\n' || v_msg
                    ELSE E'\n\nРаботодатель не оставил дополнительного сообщения.' END;

  INSERT INTO public.notifications
    (recipient_kind, candidate_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('candidate', _candidate,
     CASE WHEN _decision='invited' THEN 'candidate_invited' WHEN _decision='review' THEN 'candidate_review' ELSE 'candidate_rejected' END,
     CASE WHEN _decision='invited' THEN 'Вас пригласили на работу'
          WHEN _decision='review'  THEN 'Ваша кандидатура на рассмотрении'
          ELSE 'Решение по вашей кандидатуре' END,
     v_body,
     '/candidate',
     jsonb_build_object('decision', _decision, 'message', _message, 'company', v_comp),
     'decision:' || now()::text)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.candidate_invite_decision(uuid, text, text) TO authenticated, service_role;
