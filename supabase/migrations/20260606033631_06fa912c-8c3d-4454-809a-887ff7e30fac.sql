ALTER TABLE public.job_titles ADD COLUMN IF NOT EXISTS interview_template JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.job_title_get_interview_template(_title text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT interview_template FROM public.job_titles WHERE title_norm = lower(btrim(_title)) LIMIT 1), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.admin_job_title_upsert_interview_template(_title text, _patch jsonb, _overwrite boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_norm text := lower(btrim(_title));
  v_row public.job_titles;
  v_merged jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_norm IS NULL OR v_norm = '' THEN RAISE EXCEPTION 'empty_title'; END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN RAISE EXCEPTION 'bad_patch'; END IF;
  SELECT * INTO v_row FROM public.job_titles WHERE title_norm = v_norm LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.job_titles (title, usage_count, is_basic, created_by, interview_template)
    VALUES (btrim(_title), 0, false, auth.uid(), '{}'::jsonb) RETURNING * INTO v_row;
  END IF;
  IF _overwrite THEN
    v_merged := COALESCE(v_row.interview_template,'{}'::jsonb) || _patch;
  ELSE
    v_merged := _patch || COALESCE(v_row.interview_template,'{}'::jsonb);
  END IF;
  UPDATE public.job_titles SET interview_template = v_merged WHERE id = v_row.id;
  RETURN v_merged;
END $$;