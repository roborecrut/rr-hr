
-- ============ EMPLOYERS ============
CREATE TABLE public.employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_tg TEXT,
  ref_by TEXT,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  bonus_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employers TO authenticated;
GRANT ALL ON public.employers TO service_role;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employers self select" ON public.employers FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "employers self insert" ON public.employers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "employers self update" ON public.employers FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "employers admin delete" ON public.employers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_employers_updated BEFORE UPDATE ON public.employers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_employers_user ON public.employers(user_id);

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employer_id UUID NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  mission_text TEXT,
  about_text TEXT,
  team_text TEXT,
  payouts_text TEXT,
  schedule_text TEXT,
  system_text TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies public read published" ON public.companies FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "companies auth read"  ON public.companies FOR SELECT TO authenticated USING (
  is_published = true
  OR EXISTS (SELECT 1 FROM public.employers e WHERE e.id = owner_employer_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "companies owner write" ON public.companies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = owner_employer_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = owner_employer_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_companies_owner ON public.companies(owner_employer_id);
CREATE INDEX idx_companies_slug ON public.companies(slug);

-- ============ PROJECTS (vacancies) ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  role_name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  salary_terms TEXT,
  schedule_terms TEXT,
  motivation_text TEXT,
  motivation_text_detail TEXT,
  custom_wiki TEXT,
  vacancy_text TEXT,
  company_text TEXT,
  onboarding_text TEXT,
  payouts_text TEXT,
  schedule_text TEXT,
  team_text TEXT,
  system_text TEXT,
  tasks_activity_text TEXT,
  cabinet_tabs_text TEXT,
  training_prof_text TEXT,
  training_product_text TEXT,
  training_system_text TEXT,
  mission_text TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_tasks BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects public read published" ON public.projects FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "projects auth read" ON public.projects FOR SELECT TO authenticated USING (
  is_published = true
  OR EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "projects owner write" ON public.projects FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_projects_employer ON public.projects(employer_id);
CREATE INDEX idx_projects_company ON public.projects(company_id);
CREATE INDEX idx_projects_slug ON public.projects(slug);

-- ============ PROJECT LANDINGS ============
CREATE TABLE public.project_landings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  theme TEXT DEFAULT 'default',
  hero JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_landings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_landings TO authenticated;
GRANT ALL ON public.project_landings TO service_role;
ALTER TABLE public.project_landings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landings public read published" ON public.project_landings FOR SELECT TO anon USING (published_at IS NOT NULL);
CREATE POLICY "landings auth read" ON public.project_landings FOR SELECT TO authenticated USING (
  published_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = project_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "landings owner write" ON public.project_landings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = project_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = project_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_landings_updated BEFORE UPDATE ON public.project_landings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_landings_project ON public.project_landings(project_id);

-- ============ CANDIDATES ============
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  landing_slug TEXT,
  ref_source TEXT,
  current_stage public.candidate_stage NOT NULL DEFAULT 'terms',
  role_name TEXT,
  resume_name TEXT,
  resume_text TEXT,
  registered_via public.registration_method,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cand self select" ON public.candidates FOR SELECT TO authenticated USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = project_id AND e.user_id = auth.uid())
);
CREATE POLICY "cand self insert" ON public.candidates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cand self update" ON public.candidates FOR UPDATE TO authenticated USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = project_id AND e.user_id = auth.uid())
);
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_candidates_user ON public.candidates(user_id);
CREATE INDEX idx_candidates_project ON public.candidates(project_id);
