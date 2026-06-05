
-- Per-role field templates (vacancy + training)
ALTER TABLE public.job_titles
  ADD COLUMN IF NOT EXISTS field_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Training-related extension fields on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS training_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_intro_text text,
  ADD COLUMN IF NOT EXISTS training_wiki_text text,
  ADD COLUMN IF NOT EXISTS training_regulations_text text;

-- Read templates for a given title (case-insensitive). Returns {} when absent.
CREATE OR REPLACE FUNCTION public.job_title_get_templates(_title text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT field_templates FROM public.job_titles
       WHERE title_norm = lower(btrim(_title)) LIMIT 1),
    '{}'::jsonb)
$$;

-- Save / merge templates for a title. Only authenticated users may write.
-- The first non-empty save wins per field (does NOT overwrite existing keys).
CREATE OR REPLACE FUNCTION public.job_title_save_templates(_title text, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := lower(btrim(_title));
  v_row public.job_titles;
  v_existing jsonb;
  v_merged jsonb;
  k text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF v_norm IS NULL OR v_norm = '' THEN RAISE EXCEPTION 'empty_title'; END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'bad_patch';
  END IF;

  SELECT * INTO v_row FROM public.job_titles WHERE title_norm = v_norm LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.job_titles (title, usage_count, is_basic, created_by, field_templates)
    VALUES (btrim(_title), 0, false, auth.uid(), '{}'::jsonb)
    RETURNING * INTO v_row;
  END IF;

  v_existing := COALESCE(v_row.field_templates, '{}'::jsonb);
  v_merged := v_existing;
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF NOT (v_merged ? k) OR COALESCE(v_merged->>k,'') = '' THEN
      IF COALESCE(_patch->>k,'') <> '' THEN
        v_merged := v_merged || jsonb_build_object(k, _patch->k);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.job_titles SET field_templates = v_merged WHERE id = v_row.id;
  RETURN v_merged;
END $$;

GRANT EXECUTE ON FUNCTION public.job_title_get_templates(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.job_title_save_templates(text, jsonb) TO authenticated, service_role;
