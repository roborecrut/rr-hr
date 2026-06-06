
-- Entity lifecycle status for projects and companies
DO $$ BEGIN
  CREATE TYPE public.entity_status AS ENUM ('active','archived','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status public.entity_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status public.entity_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_company_status ON public.projects(company_id, status);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

-- Helper: check caller owns the project
CREATE OR REPLACE FUNCTION public._owns_project(_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employers e ON e.id = p.employer_id
    WHERE p.id = _id AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
  )
$$;

CREATE OR REPLACE FUNCTION public._owns_company(_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.employers e ON e.id = c.owner_employer_id
    WHERE c.id = _id AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
  )
$$;

CREATE OR REPLACE FUNCTION public.project_archive(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_project(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.projects
     SET status='archived', is_published=false,
         archived_at = COALESCE(archived_at, now()), updated_at=now()
   WHERE id=_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.project_restore(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_project(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.projects
     SET status='active', archived_at=NULL, deleted_at=NULL, updated_at=now()
   WHERE id=_id AND status <> 'deleted' OR (status='deleted' AND public.has_role(auth.uid(),'admin'::public.app_role));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.project_soft_delete(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_project(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.projects
     SET status='deleted', is_published=false,
         deleted_at = COALESCE(deleted_at, now()),
         archived_at = COALESCE(archived_at, now()),
         updated_at=now()
   WHERE id=_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.company_archive(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_company(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.companies
     SET status='archived', is_published=false,
         archived_at=COALESCE(archived_at, now()), updated_at=now()
   WHERE id=_id;
  UPDATE public.projects
     SET status='archived', is_published=false,
         archived_at=COALESCE(archived_at, now()), updated_at=now()
   WHERE company_id=_id AND status='active';
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.company_restore(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_company(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.companies
     SET status='active', archived_at=NULL, deleted_at=NULL, updated_at=now()
   WHERE id=_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.company_soft_delete(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._owns_company(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.companies
     SET status='deleted', is_published=false,
         deleted_at=COALESCE(deleted_at, now()),
         archived_at=COALESCE(archived_at, now()), updated_at=now()
   WHERE id=_id;
  UPDATE public.projects
     SET status='archived', is_published=false,
         archived_at=COALESCE(archived_at, now()), updated_at=now()
   WHERE company_id=_id AND status='active';
  RETURN jsonb_build_object('ok', true);
END $$;
