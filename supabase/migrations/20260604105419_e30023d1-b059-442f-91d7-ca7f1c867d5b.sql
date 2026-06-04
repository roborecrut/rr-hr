
-- ============================================================
-- 1. SEQUENCES per entity (prefix dictates first digit)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.seq_employer_pid  START 100001 MINVALUE 100001;
CREATE SEQUENCE IF NOT EXISTS public.seq_candidate_pid START 200001 MINVALUE 200001;
CREATE SEQUENCE IF NOT EXISTS public.seq_company_pid   START 300001 MINVALUE 300001;
CREATE SEQUENCE IF NOT EXISTS public.seq_vacancy_pid   START 400001 MINVALUE 400001;
CREATE SEQUENCE IF NOT EXISTS public.seq_interview_pid START 500001 MINVALUE 500001;
CREATE SEQUENCE IF NOT EXISTS public.seq_training_pid  START 600001 MINVALUE 600001;

-- ============================================================
-- 2. ADD public_id columns where missing
-- ============================================================
ALTER TABLE public.companies       ADD COLUMN IF NOT EXISTS public_id text UNIQUE;
ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS public_id text UNIQUE;
ALTER TABLE public.interviews      ADD COLUMN IF NOT EXISTS public_id text UNIQUE;
ALTER TABLE public.training_blocks ADD COLUMN IF NOT EXISTS public_id text UNIQUE;

-- ============================================================
-- 3. Trigger functions — replace random IDs with sequential
-- ============================================================
CREATE OR REPLACE FUNCTION public.employers_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id ~ '^emp' THEN
    NEW.public_id := nextval('public.seq_employer_pid')::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.candidates_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_candidate_pid')::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.companies_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_company_pid')::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.projects_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_vacancy_pid')::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.interviews_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_interview_pid')::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.training_blocks_set_public_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_training_pid')::text;
  END IF;
  RETURN NEW;
END $$;

-- Drop old triggers if they exist, recreate
DROP TRIGGER IF EXISTS trg_employers_pid       ON public.employers;
DROP TRIGGER IF EXISTS trg_candidates_pid      ON public.candidates;
DROP TRIGGER IF EXISTS trg_companies_pid       ON public.companies;
DROP TRIGGER IF EXISTS trg_projects_pid        ON public.projects;
DROP TRIGGER IF EXISTS trg_interviews_pid      ON public.interviews;
DROP TRIGGER IF EXISTS trg_training_blocks_pid ON public.training_blocks;
DROP TRIGGER IF EXISTS employers_pid_trg       ON public.employers;
DROP TRIGGER IF EXISTS candidates_pid_trg      ON public.candidates;

CREATE TRIGGER trg_employers_pid       BEFORE INSERT ON public.employers       FOR EACH ROW EXECUTE FUNCTION public.employers_set_public_id();
CREATE TRIGGER trg_candidates_pid      BEFORE INSERT ON public.candidates      FOR EACH ROW EXECUTE FUNCTION public.candidates_set_public_id();
CREATE TRIGGER trg_companies_pid       BEFORE INSERT ON public.companies       FOR EACH ROW EXECUTE FUNCTION public.companies_set_public_id();
CREATE TRIGGER trg_projects_pid        BEFORE INSERT ON public.projects        FOR EACH ROW EXECUTE FUNCTION public.projects_set_public_id();
CREATE TRIGGER trg_interviews_pid      BEFORE INSERT ON public.interviews      FOR EACH ROW EXECUTE FUNCTION public.interviews_set_public_id();
CREATE TRIGGER trg_training_blocks_pid BEFORE INSERT ON public.training_blocks FOR EACH ROW EXECUTE FUNCTION public.training_blocks_set_public_id();

-- ============================================================
-- 4. BACKFILL existing rows in created_at order
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.employers ORDER BY created_at LOOP
    UPDATE public.employers SET public_id = nextval('public.seq_employer_pid')::text WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.candidates ORDER BY created_at LOOP
    UPDATE public.candidates SET public_id = nextval('public.seq_candidate_pid')::text WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.companies ORDER BY created_at LOOP
    UPDATE public.companies SET public_id = nextval('public.seq_company_pid')::text WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.projects ORDER BY created_at LOOP
    UPDATE public.projects SET public_id = nextval('public.seq_vacancy_pid')::text WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.interviews ORDER BY created_at LOOP
    UPDATE public.interviews SET public_id = nextval('public.seq_interview_pid')::text WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.training_blocks ORDER BY created_at LOOP
    UPDATE public.training_blocks SET public_id = nextval('public.seq_training_pid')::text WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- 5. WALLETS: add unified units_balance
-- ============================================================
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS units_balance integer NOT NULL DEFAULT 0;

-- ============================================================
-- 6. EMPLOYERS: telegram bonus flag + bonus = 500
-- ============================================================
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS telegram_bonus_granted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.grant_employer_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (NEW.id) ON CONFLICT (employer_id) DO NOTHING;
  IF NOT NEW.bonus_granted THEN
    PERFORM public.apply_transaction(NEW.id, 'bonus'::public.tx_type, 500, 'employers', NEW.id, 'Signup bonus (Google/Telegram)');
    UPDATE public.employers SET bonus_granted = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- One-time +500 RR when employer first links Telegram (called from edge function)
CREATE OR REPLACE FUNCTION public.grant_telegram_link_bonus(_employer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_done boolean;
BEGIN
  SELECT telegram_bonus_granted INTO v_done FROM public.employers WHERE id = _employer FOR UPDATE;
  IF v_done IS NULL OR v_done = true THEN RETURN false; END IF;
  PERFORM public.apply_transaction(_employer, 'bonus'::public.tx_type, 500, 'employers', _employer, 'Telegram link bonus');
  UPDATE public.employers SET telegram_bonus_granted = true WHERE id = _employer;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.grant_telegram_link_bonus(uuid) TO service_role;
