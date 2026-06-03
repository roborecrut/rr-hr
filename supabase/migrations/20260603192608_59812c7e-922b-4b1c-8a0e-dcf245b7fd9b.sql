
-- 1) Make employer.user_id nullable (admin-seeded demos)
ALTER TABLE public.employers ALTER COLUMN user_id DROP NOT NULL;

-- 2) Add public_id columns
ALTER TABLE public.employers  ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;

-- 3) Slugify helper (RU -> LAT, lowercase, dash-separated)
CREATE OR REPLACE FUNCTION public.slugify_ru(_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s TEXT;
BEGIN
  IF _input IS NULL THEN RETURN NULL; END IF;
  s := lower(_input);
  s := translate(s,
    'абвгдеёжзийклмнопрстуфхцыэ',
    'abvgdeezzijklmnoprstufhcye');
  s := replace(s,'ж','zh');
  s := replace(s,'ч','ch');
  s := replace(s,'ш','sh');
  s := replace(s,'щ','sch');
  s := replace(s,'ю','yu');
  s := replace(s,'я','ya');
  s := replace(s,'ь','');
  s := replace(s,'ъ','');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  IF s = '' THEN s := 'item'; END IF;
  RETURN s;
END $$;

-- 4) Trigger: auto slug for companies
CREATE OR REPLACE FUNCTION public.companies_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base TEXT; candidate TEXT; n INT := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := public.slugify_ru(COALESCE(NEW.name,'company'));
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_set_slug ON public.companies;
CREATE TRIGGER trg_companies_set_slug
BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_set_slug();

-- 5) Trigger: auto slug for projects
CREATE OR REPLACE FUNCTION public.projects_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base TEXT; candidate TEXT; n INT := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := public.slugify_ru(COALESCE(NEW.role_name,'job'));
    candidate := base || '-1';
    WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || (n+1);
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projects_set_slug ON public.projects;
CREATE TRIGGER trg_projects_set_slug
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_set_slug();

-- 6) Trigger: auto public_id for employers (emp + 6 hex)
CREATE OR REPLACE FUNCTION public.employers_set_public_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    LOOP
      candidate := 'emp' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.employers WHERE public_id = candidate);
    END LOOP;
    NEW.public_id := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employers_set_public_id ON public.employers;
CREATE TRIGGER trg_employers_set_public_id
BEFORE INSERT ON public.employers
FOR EACH ROW EXECUTE FUNCTION public.employers_set_public_id();

-- 7) Trigger: auto public_id for candidates (6 digits)
CREATE OR REPLACE FUNCTION public.candidates_set_public_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    LOOP
      candidate := lpad((100000 + floor(random()*899999))::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.candidates WHERE public_id = candidate);
    END LOOP;
    NEW.public_id := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_candidates_set_public_id ON public.candidates;
CREATE TRIGGER trg_candidates_set_public_id
BEFORE INSERT ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.candidates_set_public_id();

-- 8) Backfill any existing rows (DB is empty, but safe)
UPDATE public.companies  SET slug = public.slugify_ru(name)     WHERE slug IS NULL OR slug = '';
UPDATE public.projects   SET slug = public.slugify_ru(role_name) || '-1' WHERE slug IS NULL OR slug = '';
UPDATE public.employers  SET public_id = 'emp' || substr(md5(id::text),1,6) WHERE public_id IS NULL OR public_id = '';
UPDATE public.candidates SET public_id = lpad((100000 + (abs(hashtext(id::text)) % 899999))::text,6,'0') WHERE public_id IS NULL OR public_id = '';

-- 9) Seed demo data: employer (emp-demo) + company + project + candidate (693126)
DO $$
DECLARE
  v_emp_id  UUID;
  v_comp_id UUID;
  v_proj_id UUID;
  v_cand_id UUID;
BEGIN
  -- employer
  INSERT INTO public.employers (public_id, company_name, contact_name, contact_email, contact_tg, plan, status, bonus_granted)
  VALUES ('emp-demo', 'ООО РобоРекрут инжиниринг', 'Сергей Ковалев', 'hr-director@company.ru', 'cowal_sales', 'bronze', 'active', true)
  ON CONFLICT (public_id) DO UPDATE SET company_name = EXCLUDED.company_name
  RETURNING id INTO v_emp_id;

  -- wallet
  INSERT INTO public.wallets (employer_id, balance_rr) VALUES (v_emp_id, 1000) ON CONFLICT (employer_id) DO NOTHING;

  -- company
  INSERT INTO public.companies (owner_employer_id, name, slug, logo_url, mission_text, about_text, is_published)
  VALUES (v_emp_id, 'ООО РобоРекрут инжиниринг', 'ooo-roborekrut-inzhiniring',
          'https://i.ibb.co/WWRbtPq0/RR-Logo.png',
          'Делаем найм и адаптацию умнее с помощью ИИ.',
          'Мы поставляем ИИ-сервисы для подбора и обучения персонала.', true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_comp_id;

  -- project
  INSERT INTO public.projects (employer_id, company_id, role_name, slug, salary_terms, schedule_terms,
                               motivation_text, custom_wiki, logo_url, is_published)
  VALUES (v_emp_id, v_comp_id, 'Менеджер по продажам', 'sales-prod-1',
          '80000 - 120000 руб', '5/2, гибридный график',
          'Премии за выполнение KPI, обучение за счёт компании.',
          'Правила адаптации: мы поставляем ИИ-сервисы. Кандидат должен владеть техниками продаж.',
          'https://i.ibb.co/WWRbtPq0/RR-Logo.png', true)
  ON CONFLICT (slug) DO UPDATE SET role_name = EXCLUDED.role_name
  RETURNING id INTO v_proj_id;

  -- candidate
  INSERT INTO public.candidates (public_id, project_id, role_name, current_stage, registered_via)
  VALUES ('693126', v_proj_id, 'Менеджер по продажам', 'terms', 'telegram')
  ON CONFLICT (public_id) DO UPDATE SET project_id = EXCLUDED.project_id
  RETURNING id INTO v_cand_id;
END $$;
