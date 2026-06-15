
-- ============================================================
-- 1) candidates: column-level SELECT, исключая password_hash
-- ============================================================
REVOKE SELECT ON public.candidates FROM anon;
REVOKE SELECT ON public.candidates FROM authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name='candidates'
     AND column_name <> 'password_hash';

  EXECUTE format('GRANT SELECT (%s) ON public.candidates TO authenticated', cols);
  EXECUTE format('GRANT SELECT (%s) ON public.candidates TO anon', cols);
END $$;

-- service_role и postgres сохраняют полный доступ (он у них уже есть)

-- ============================================================
-- 2) job_titles: column-level SELECT, исключая interview_template
-- ============================================================
REVOKE SELECT ON public.job_titles FROM anon;
REVOKE SELECT ON public.job_titles FROM authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name='job_titles'
     AND column_name <> 'interview_template';

  EXECUTE format('GRANT SELECT (%s) ON public.job_titles TO authenticated', cols);
  EXECUTE format('GRANT SELECT (%s) ON public.job_titles TO anon', cols);
END $$;
