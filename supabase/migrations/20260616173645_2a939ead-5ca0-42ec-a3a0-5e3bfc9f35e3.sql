ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_hire_decision_check;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_hire_decision_check
  CHECK (hire_decision IN ('invited','rejected','review'));

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

  INSERT INTO public.notifications
    (recipient_kind, candidate_id, kind, title, body, link, meta, dedup_key)
  VALUES
    ('candidate', _candidate,
     CASE WHEN _decision='invited' THEN 'candidate_invited' WHEN _decision='review' THEN 'candidate_review' ELSE 'candidate_rejected' END,
     CASE WHEN _decision='invited' THEN 'Вас пригласили на работу' WHEN _decision='review' THEN 'Ваша кандидатура на рассмотрении' ELSE 'Решение по вашей кандидатуре' END,
     CASE WHEN _decision='invited'
          THEN 'Работодатель ' || COALESCE(v_comp,'') || ' ждёт вас. Откройте сообщение в кабинете.'
          WHEN _decision='review'
          THEN 'Работодатель ' || COALESCE(v_comp,'') || ' дополнительно изучает вашу кандидатуру.'
          ELSE 'Работодатель ' || COALESCE(v_comp,'') || ' принял решение по вашей кандидатуре.' END,
     '/candidate',
     jsonb_build_object('decision', _decision, 'message', _message),
     'decision:' || now()::text)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.candidate_invite_decision(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_full_details(_candidate uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (public.can_view_candidate(_candidate) OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'candidate', to_jsonb(c.*),
    'profile', to_jsonb(p.*),
    'company', to_jsonb(co.*),
    'project', to_jsonb(pr.*),
    'scores', to_jsonb(s.*),
    'answers', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(a.*)
          || jsonb_build_object(
            'question_text', q.question,
            'question_category', q.category,
            'question_type', q.type
          )
        ORDER BY a.created_at
      )
      FROM public.candidate_answers a
      LEFT JOIN public.project_questions q ON q.id = a.question_id
      WHERE a.candidate_id = c.id
    ), '[]'::jsonb),
    'stage_progress', COALESCE((SELECT jsonb_agg(to_jsonb(sp.*) ORDER BY sp.created_at) FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id), '[]'::jsonb),
    'training_progress', COALESCE((SELECT jsonb_agg(to_jsonb(tp.*) ORDER BY tp.created_at) FROM public.candidate_training_progress tp WHERE tp.candidate_id = c.id), '[]'::jsonb),
    'interviews', COALESCE((SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at) FROM public.interviews i WHERE i.candidate_id = c.id), '[]'::jsonb),
    'interview_blocks', COALESCE((SELECT jsonb_agg(to_jsonb(ib.*) ORDER BY ib.kind) FROM public.interview_blocks ib WHERE ib.project_id = c.project_id), '[]'::jsonb)
  ) INTO v
  FROM public.candidates c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects pr ON pr.id = c.project_id
  LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
  WHERE c.id = _candidate;
  RETURN v;
END
$function$;

GRANT EXECUTE ON FUNCTION public.candidate_full_details(uuid) TO authenticated, service_role;