
-- ============ 1. DROP TELEGRAM/REFERRAL FUNCTIONS & TRIGGERS ============
DROP TRIGGER IF EXISTS trg_grant_admin_on_tg_link ON public.telegram_links;
DROP FUNCTION IF EXISTS public.grant_admin_on_tg_link() CASCADE;
DROP FUNCTION IF EXISTS public.grant_telegram_link_bonus(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.log_telegram_event(text,text,text,text,text,text,text,integer,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.admin_telegram_metrics(integer) CASCADE;
DROP FUNCTION IF EXISTS public.apply_referral_bonus(text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.apply_referral_bonus(text,uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_referees() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_referrer() CASCADE;
DROP FUNCTION IF EXISTS public.referral_lookup(text) CASCADE;

-- ============ 2. DROP TELEGRAM/REFERRAL TABLES ============
DROP TABLE IF EXISTS public.telegram_events CASCADE;
DROP TABLE IF EXISTS public.telegram_links CASCADE;
DROP TABLE IF EXISTS public.telegram_logs CASCADE;
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.oauth_states CASCADE;

-- ============ 3. DROP TELEGRAM COLUMNS ============
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS telegram_id,
  DROP COLUMN IF EXISTS telegram_username,
  DROP COLUMN IF EXISTS telegram_first_name,
  DROP COLUMN IF EXISTS telegram_last_name,
  DROP COLUMN IF EXISTS telegram_photo_url,
  DROP COLUMN IF EXISTS telegram_phone;

ALTER TABLE public.employers
  DROP COLUMN IF EXISTS telegram_bonus_granted,
  DROP COLUMN IF EXISTS contact_tg;

-- ============ 4. WALLETS → units only ============
-- We keep transactions.amount_rr as numeric but it now represents units.
ALTER TABLE public.wallets DROP COLUMN IF EXISTS balance_rr;
ALTER TABLE public.wallets DROP COLUMN IF EXISTS hold_rr;
ALTER TABLE public.wallets ALTER COLUMN units_balance SET DEFAULT 0;
UPDATE public.wallets SET units_balance = 0 WHERE units_balance IS NULL;
ALTER TABLE public.wallets ALTER COLUMN units_balance SET NOT NULL;

-- Reset all balances to 0 — fresh start
UPDATE public.wallets SET units_balance = 0;
DELETE FROM public.transactions;

-- New apply_transaction operates on units_balance
CREATE OR REPLACE FUNCTION public.apply_transaction(_employer uuid, _type tx_type, _amount numeric, _ref_table text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet public.wallets;
  v_tx public.transactions;
  v_delta INTEGER;
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (_employer) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = _employer FOR UPDATE;

  v_delta := CASE WHEN _type IN ('topup','bonus','refund') THEN _amount::int ELSE -(_amount::int) END;
  IF v_wallet.units_balance + v_delta < 0 THEN
    RAISE EXCEPTION 'insufficient_units';
  END IF;

  UPDATE public.wallets SET units_balance = units_balance + v_delta, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note)
  VALUES (v_wallet.id, _type, _amount, _ref_table, _ref_id, _note)
  RETURNING * INTO v_tx;

  RETURN v_tx;
END $function$;

-- New signup bonus: 10 units
CREATE OR REPLACE FUNCTION public.grant_employer_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (NEW.id) ON CONFLICT (employer_id) DO NOTHING;
  IF NOT NEW.bonus_granted THEN
    PERFORM public.apply_transaction(NEW.id, 'bonus'::public.tx_type, 10, 'employers', NEW.id, 'Signup bonus: 10 units');
    UPDATE public.employers SET bonus_granted = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;

-- ============ 5. handle_new_user — drop telegram ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_intent TEXT := NULLIF(NEW.raw_user_meta_data->>'intent','');
  v_via    TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'registered_via',''),'email');
  v_is_admin BOOLEAN := (lower(COALESCE(NEW.email,'')) = 'shishkarnem@gmail.com');
  v_kinds TEXT[] := CASE WHEN v_intent IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_intent]::text[] END;
BEGIN
  INSERT INTO public.profiles (
    id, display_name, avatar_url, email, registered_via,
    google_email, account_kinds, last_signup_intent
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NEW.email,
    v_via::public.registration_method,
    CASE WHEN v_via='google' THEN NEW.email ELSE NULL END,
    v_kinds,
    v_intent
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_intent IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, CASE WHEN v_intent='employer' THEN 'employer'::public.app_role ELSE 'candidate'::public.app_role END)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;

-- ============ 6. NEW PUBLIC_ID SEQUENCES ============
CREATE SEQUENCE IF NOT EXISTS public.seq_employer_pid_v2 START 100001;
CREATE SEQUENCE IF NOT EXISTS public.seq_candidate_pid_v2 START 200001;
CREATE SEQUENCE IF NOT EXISTS public.seq_company_pid_v2 START 300001;
CREATE SEQUENCE IF NOT EXISTS public.seq_vacancy_pid_v2 START 400001;
CREATE SEQUENCE IF NOT EXISTS public.seq_interview_pid_v2 START 500001;
CREATE SEQUENCE IF NOT EXISTS public.seq_training_pid_v2 START 600001;

-- Add legacy columns to remember old slugs/ids
ALTER TABLE public.employers ADD COLUMN IF NOT EXISTS legacy_public_id text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS legacy_public_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legacy_public_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legacy_slug text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legacy_public_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legacy_slug text;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS legacy_public_id text;
ALTER TABLE public.training_blocks ADD COLUMN IF NOT EXISTS legacy_public_id text;

-- Backfill legacy + renumber in created_at order
UPDATE public.employers SET legacy_public_id = public_id WHERE legacy_public_id IS NULL;
UPDATE public.candidates SET legacy_public_id = public_id WHERE legacy_public_id IS NULL;
UPDATE public.companies SET legacy_public_id = public_id, legacy_slug = slug WHERE legacy_public_id IS NULL;
UPDATE public.projects SET legacy_public_id = public_id, legacy_slug = slug WHERE legacy_public_id IS NULL;
UPDATE public.interviews SET legacy_public_id = public_id WHERE legacy_public_id IS NULL;
UPDATE public.training_blocks SET legacy_public_id = public_id WHERE legacy_public_id IS NULL;

-- Renumber existing rows (small dataset, safe loop via row_number)
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.employers
)
UPDATE public.employers e SET public_id = (100001 + ranked.rn)::text FROM ranked WHERE e.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.candidates
)
UPDATE public.candidates c SET public_id = (200001 + ranked.rn)::text FROM ranked WHERE c.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.companies
)
UPDATE public.companies c SET public_id = (300001 + ranked.rn)::text, slug = (300001 + ranked.rn)::text FROM ranked WHERE c.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.projects
)
UPDATE public.projects p SET public_id = (400001 + ranked.rn)::text, slug = (400001 + ranked.rn)::text FROM ranked WHERE p.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.interviews
)
UPDATE public.interviews i SET public_id = (500001 + ranked.rn)::text FROM ranked WHERE i.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn FROM public.training_blocks
)
UPDATE public.training_blocks t SET public_id = (600001 + ranked.rn)::text FROM ranked WHERE t.id = ranked.id;

-- Advance sequences past existing values
SELECT setval('public.seq_employer_pid_v2', GREATEST(100001, (SELECT COALESCE(MAX(public_id::bigint), 100000) FROM public.employers) + 1), false);
SELECT setval('public.seq_candidate_pid_v2', GREATEST(200001, (SELECT COALESCE(MAX(public_id::bigint), 200000) FROM public.candidates) + 1), false);
SELECT setval('public.seq_company_pid_v2', GREATEST(300001, (SELECT COALESCE(MAX(public_id::bigint), 300000) FROM public.companies) + 1), false);
SELECT setval('public.seq_vacancy_pid_v2', GREATEST(400001, (SELECT COALESCE(MAX(public_id::bigint), 400000) FROM public.projects) + 1), false);
SELECT setval('public.seq_interview_pid_v2', GREATEST(500001, (SELECT COALESCE(MAX(public_id::bigint), 500000) FROM public.interviews) + 1), false);
SELECT setval('public.seq_training_pid_v2', GREATEST(600001, (SELECT COALESCE(MAX(public_id::bigint), 600000) FROM public.training_blocks) + 1), false);

-- New triggers
CREATE OR REPLACE FUNCTION public.employers_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_employer_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.candidates_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_candidate_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.companies_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_company_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;

-- companies slug = public_id (no transliteration)
CREATE OR REPLACE FUNCTION public.companies_set_slug()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_company_pid_v2')::text;
  END IF;
  NEW.slug := NEW.public_id;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.projects_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_vacancy_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.projects_set_slug()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_vacancy_pid_v2')::text;
  END IF;
  NEW.slug := NEW.public_id;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.interviews_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_interview_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.training_blocks_set_public_id()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id !~ '^[0-9]+$' THEN
    NEW.public_id := nextval('public.seq_training_pid_v2')::text;
  END IF;
  RETURN NEW;
END $function$;
