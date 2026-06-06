ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS onboarding_text text,
  ADD COLUMN IF NOT EXISTS motivation_text_detail text,
  ADD COLUMN IF NOT EXISTS training_professional_text text,
  ADD COLUMN IF NOT EXISTS training_systems_text text,
  ADD COLUMN IF NOT EXISTS training_wiki_text text,
  ADD COLUMN IF NOT EXISTS training_regulations_text text;

ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS onboarding_text text,
  ADD COLUMN IF NOT EXISTS motivation_text_detail text,
  ADD COLUMN IF NOT EXISTS training_professional_text text,
  ADD COLUMN IF NOT EXISTS training_systems_text text,
  ADD COLUMN IF NOT EXISTS training_wiki_text text,
  ADD COLUMN IF NOT EXISTS training_regulations_text text;

CREATE OR REPLACE FUNCTION public.job_titles_list_public()
RETURNS TABLE(id uuid, title text, title_norm text, usage_count integer, is_basic boolean, has_template boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.title, j.title_norm, j.usage_count, j.is_basic,
         (COALESCE(j.field_templates,'{}'::jsonb) <> '{}'::jsonb) AS has_template
    FROM public.job_titles j
    ORDER BY j.title ASC
$$;

GRANT EXECUTE ON FUNCTION public.job_titles_list_public() TO anon, authenticated;