
-- 1) Add columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS description_text text,
  ADD COLUMN IF NOT EXISTS products_text text;

-- Backfill: published companies => active
UPDATE public.companies SET status = 'active' WHERE is_published = true AND status = 'draft';

-- 2) RPC: create draft company for current employer (reuse latest open draft if any)
CREATE OR REPLACE FUNCTION public.company_create_draft()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_existing public.companies;
  v_new public.companies;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  SELECT * INTO v_existing FROM public.companies
    WHERE owner_employer_id = v_emp AND status = 'draft'
    ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing.id, 'public_id', v_existing.public_id, 'reused', true);
  END IF;

  INSERT INTO public.companies (owner_employer_id, name, status, is_published, stats)
  VALUES (v_emp, '', 'draft', false, '{}'::jsonb)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('id', v_new.id, 'public_id', v_new.public_id, 'reused', false);
END $$;

-- 3) RPC: finalize company (activate + publish)
CREATE OR REPLACE FUNCTION public.company_finalize(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_owner uuid;
  v_pid text;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;
  SELECT owner_employer_id, public_id INTO v_owner, v_pid FROM public.companies WHERE id = _id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_owner <> v_emp AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.companies SET status = 'active', is_published = true, updated_at = now() WHERE id = _id;
  RETURN jsonb_build_object('ok', true, 'id', _id, 'public_id', v_pid);
END $$;

-- 4) RPC: update company fields (owner only)
CREATE OR REPLACE FUNCTION public.company_update(_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION public.company_create_draft() TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_finalize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_update(uuid, jsonb) TO authenticated;
