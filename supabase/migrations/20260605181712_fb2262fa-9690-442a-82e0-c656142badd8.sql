ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS website  text,
  ADD COLUMN IF NOT EXISTS staff    text;

CREATE OR REPLACE FUNCTION public.company_update(_id uuid, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp uuid;
  v_owner uuid;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;
  SELECT owner_employer_id INTO v_owner FROM public.companies WHERE id = _id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_owner <> v_emp AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.companies SET
    name             = COALESCE(_patch->>'name', name),
    logo_url         = COALESCE(_patch->>'logo_url', logo_url),
    industry         = COALESCE(_patch->>'industry', industry),
    website          = COALESCE(_patch->>'website',  website),
    staff            = COALESCE(_patch->>'staff',    staff),
    description_text = COALESCE(_patch->>'description_text', description_text),
    products_text    = COALESCE(_patch->>'products_text', products_text),
    mission_text     = COALESCE(_patch->>'mission_text', mission_text),
    about_text       = COALESCE(_patch->>'about_text', about_text),
    team_text        = COALESCE(_patch->>'team_text', team_text),
    payouts_text     = COALESCE(_patch->>'payouts_text', payouts_text),
    schedule_text    = COALESCE(_patch->>'schedule_text', schedule_text),
    system_text      = COALESCE(_patch->>'system_text', system_text),
    stats            = COALESCE(_patch->'stats', stats),
    updated_at       = now()
  WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END $function$;