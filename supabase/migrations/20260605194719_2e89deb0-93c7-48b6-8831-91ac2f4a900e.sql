
-- 1) job_titles catalog
CREATE TABLE IF NOT EXISTS public.job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_norm text GENERATED ALWAYS AS (lower(btrim(title))) STORED UNIQUE,
  usage_count integer NOT NULL DEFAULT 0,
  is_basic boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_titles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.job_titles TO authenticated;
GRANT ALL ON public.job_titles TO service_role;

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read job titles" ON public.job_titles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can add job titles" ON public.job_titles
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update job titles" ON public.job_titles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Upsert helper (security definer so it can bump usage_count regardless of RLS)
CREATE OR REPLACE FUNCTION public.job_title_upsert(_title text)
RETURNS public.job_titles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := lower(btrim(_title));
  v_row public.job_titles;
BEGIN
  IF v_norm IS NULL OR v_norm = '' THEN RAISE EXCEPTION 'empty_title'; END IF;
  IF char_length(v_norm) > 120 THEN RAISE EXCEPTION 'title_too_long'; END IF;

  SELECT * INTO v_row FROM public.job_titles WHERE title_norm = v_norm LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    UPDATE public.job_titles SET usage_count = usage_count + 1 WHERE id = v_row.id
      RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO public.job_titles (title, usage_count, is_basic, created_by)
  VALUES (btrim(_title), 1, false, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.job_title_upsert(text) TO anon, authenticated;

-- Seed (basic specialties)
INSERT INTO public.job_titles (title, is_basic) VALUES
  ('Менеджер по продажам', true),('Продавец', true),('Оператор ПК', true),('Ассистент', true),
  ('Комерческий директор', true),('Операционный директор', true),('Генеральный директор', true),
  ('Руководитель отдела маркетинга', true),('Финансовый директор', true),
  ('Руководитель отдела логистики', true),('Менеджер по закупкам', true),
  ('Специалист по тендерам', true),('Продуктовый аналитик', true),
  ('Руководитель группы разработки', true),('Руководитель отдела аналитики', true),
  ('Руководитель проектов', true),('Специалист по информационной безопасности', true),
  ('Специалист технической поддержки', true),('Тестировщик', true),
  ('Технический директор (CTO)', true),('Технический писатель', true),
  ('Гейм-дизайнер', true),('Дизайнер, художник', true),('Копирайтер, редактор, корректор', true),
  ('PR-менеджер', true),('SMM-менеджер, контент-менеджер', true),('Аналитик', true),
  ('Директор по маркетингу и PR (CMO)', true),('Маркетолог-аналитик', true),
  ('Менеджер по маркетингу, интернет-маркетолог', true),('Менеджер по работе с партнерами', true),
  ('Бизнес-тренер', true),('Психолог', true),
  ('Оператор call-центра, специалист контактного центра', true),
  ('Руководитель отдела клиентского обслуживания', true),('Руководитель отдела продаж', true),
  ('Специалист по сертификации', true),('Страховой агент', true),('Бизнес-аналитик', true),
  ('Менеджер/консультант по стратегии', true),('Финансовый аналитик, инвестиционный аналитик', true),
  ('Архитектор', true),('Инженер-конструктор, инженер-проектировщик', true),
  ('Инженер ПТО, инженер-сметчик', true),('Диспетчер', true),
  ('Менеджер по логистике, менеджер по ВЭД', true),('Менеджер по туризму', true),
  ('Директор по персоналу (HRD)', true),('Менеджер по компенсациям и льготам', true),
  ('Менеджер по персоналу', true),('Руководитель отдела персонала', true),
  ('Специалист по кадрам', true),('Специалист по подбору персонала', true),
  ('Аудитор', true),('Брокер', true),('Бухгалтер', true),('Казначей', true),
  ('Комплаенс-менеджер', true),('Кредитный специалист', true),('Методолог', true),
  ('Специалист по взысканию задолженности', true),('Финансовый директор (CFO)', true),
  ('Финансовый контролер', true),('Финансовый менеджер', true),('Экономист', true),
  ('Директор юридического департамента (CLO)', true),('Юрисконсульт', true),('Юрист', true)
ON CONFLICT (title_norm) DO NOTHING;

-- 2) project_create_draft RPC (mirror of company_create_draft)
CREATE OR REPLACE FUNCTION public.project_create_draft(_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_owner uuid;
  v_existing public.projects;
  v_new public.projects;
BEGIN
  SELECT id INTO v_emp FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_employer'; END IF;

  IF _company IS NOT NULL THEN
    SELECT owner_employer_id INTO v_owner FROM public.companies WHERE id = _company;
    IF v_owner IS NULL THEN RAISE EXCEPTION 'company_not_found'; END IF;
    IF v_owner <> v_emp AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Reuse an existing empty draft for the same employer/company if present
  SELECT * INTO v_existing FROM public.projects
    WHERE employer_id = v_emp
      AND (company_id IS NOT DISTINCT FROM _company)
      AND COALESCE(role_name,'') = ''
      AND COALESCE(is_published, false) = false
    ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing.id, 'public_id', v_existing.public_id, 'reused', true);
  END IF;

  INSERT INTO public.projects (employer_id, company_id, role_name, is_published)
  VALUES (v_emp, _company, '', false)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('id', v_new.id, 'public_id', v_new.public_id, 'reused', false);
END $$;

GRANT EXECUTE ON FUNCTION public.project_create_draft(uuid) TO authenticated;
