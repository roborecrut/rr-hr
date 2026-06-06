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
    'interviews', COALESCE((SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at) FROM public.interviews i WHERE i.candidate_id = c.id), '[]'::jsonb)
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