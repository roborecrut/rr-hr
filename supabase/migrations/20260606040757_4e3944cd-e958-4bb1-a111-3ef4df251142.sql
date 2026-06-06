
-- CRM stage enum and columns
DO $$ BEGIN
  CREATE TYPE public.crm_stage AS ENUM ('registration','screening','checklist','situations','professional','product','systems','certified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS crm_stage public.crm_stage NOT NULL DEFAULT 'registration',
  ADD COLUMN IF NOT EXISTS crm_stage_manual boolean NOT NULL DEFAULT false;

-- Recalc CRM stage based on existing progress signals
CREATE OR REPLACE FUNCTION public.candidate_recalc_crm_stage(_id uuid)
RETURNS public.crm_stage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_manual boolean;
  v_stage public.crm_stage := 'registration';
  v_resume numeric;
  v_check numeric;
  v_sit   numeric;
  v_has_interview boolean;
  v_prof boolean; v_prod boolean; v_sys boolean;
BEGIN
  SELECT crm_stage_manual INTO v_manual FROM public.candidates WHERE id = _id;
  IF v_manual THEN RETURN (SELECT crm_stage FROM public.candidates WHERE id = _id); END IF;

  SELECT EXISTS(SELECT 1 FROM public.interviews WHERE candidate_id = _id AND started_at IS NOT NULL) INTO v_has_interview;
  SELECT resume_score, checklist_score, situations_score
    INTO v_resume, v_check, v_sit
    FROM public.candidate_scores WHERE candidate_id = _id;

  SELECT bool_or(stage='professional' AND passed_at IS NOT NULL),
         bool_or(stage='product'      AND passed_at IS NOT NULL),
         bool_or(stage='systems'      AND passed_at IS NOT NULL)
    INTO v_prof, v_prod, v_sys
    FROM public.candidate_stage_progress WHERE candidate_id = _id;

  IF COALESCE(v_sys,false) THEN v_stage := 'certified';
  ELSIF COALESCE(v_prod,false) THEN v_stage := 'systems';
  ELSIF COALESCE(v_prof,false) THEN v_stage := 'product';
  ELSIF v_sit IS NOT NULL THEN v_stage := 'professional';
  ELSIF v_check IS NOT NULL THEN v_stage := 'situations';
  ELSIF v_resume IS NOT NULL THEN v_stage := 'checklist';
  ELSIF v_has_interview THEN v_stage := 'screening';
  ELSE v_stage := 'registration';
  END IF;

  UPDATE public.candidates SET crm_stage = v_stage WHERE id = _id AND crm_stage <> v_stage;
  RETURN v_stage;
END $fn$;

-- Trigger fns
CREATE OR REPLACE FUNCTION public.tg_recalc_crm_from_scores() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.candidate_recalc_crm_stage(NEW.candidate_id); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.tg_recalc_crm_from_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.candidate_recalc_crm_stage(NEW.candidate_id); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.tg_recalc_crm_from_interview() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.candidate_recalc_crm_stage(NEW.candidate_id); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_crm_scores ON public.candidate_scores;
CREATE TRIGGER trg_crm_scores AFTER INSERT OR UPDATE ON public.candidate_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_crm_from_scores();

DROP TRIGGER IF EXISTS trg_crm_progress ON public.candidate_stage_progress;
CREATE TRIGGER trg_crm_progress AFTER INSERT OR UPDATE ON public.candidate_stage_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_crm_from_progress();

DROP TRIGGER IF EXISTS trg_crm_interview ON public.interviews;
CREATE TRIGGER trg_crm_interview AFTER INSERT OR UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_crm_from_interview();

-- Backfill
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.candidates LOOP
    PERFORM public.candidate_recalc_crm_stage(r.id);
  END LOOP;
END $$;

-- RPC: employer (or admin) sets crm_stage manually
CREATE OR REPLACE FUNCTION public.employer_set_candidate_crm_stage(_candidate uuid, _stage public.crm_stage)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ok boolean := false;
BEGIN
  SELECT public.has_role(auth.uid(),'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.candidates c
        JOIN public.projects p ON p.id = c.project_id
        JOIN public.employers e ON e.id = p.employer_id
        WHERE c.id = _candidate AND e.user_id = auth.uid()
      )
    INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.candidates SET crm_stage = _stage, crm_stage_manual = true WHERE id = _candidate;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Admin RPC: set role
CREATE OR REPLACE FUNCTION public.admin_set_role(_user uuid, _role public.app_role, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, _role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user AND role = _role;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Admin RPC: wallet adjust
CREATE OR REPLACE FUNCTION public.admin_wallet_adjust(_employer uuid, _delta integer, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_w public.wallets; v_type public.tx_type;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.wallets(employer_id) VALUES (_employer) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_w FROM public.wallets WHERE employer_id = _employer FOR UPDATE;
  IF v_w.units_balance + _delta < 0 THEN RAISE EXCEPTION 'insufficient_units'; END IF;
  UPDATE public.wallets SET units_balance = units_balance + _delta, updated_at = now() WHERE id = v_w.id;
  v_type := CASE WHEN _delta >= 0 THEN 'bonus'::public.tx_type ELSE 'purchase'::public.tx_type END;
  INSERT INTO public.transactions(wallet_id, type, amount_rr, ref_table, ref_id, note)
    VALUES (v_w.id, v_type, abs(_delta), 'employers', _employer, COALESCE(_note,'Корректировка администратором'));
  RETURN jsonb_build_object('ok', true, 'balance', v_w.units_balance + _delta);
END $$;

-- Admin RPC: list users with roles & basic profile
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', p.id,
    'email', p.email,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles ur WHERE ur.user_id = p.id), '[]'::jsonb)
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v FROM public.profiles p;
  RETURN v;
END $$;

-- Admin RPC: list employers (clients) with status & balance
CREATE OR REPLACE FUNCTION public.admin_list_employers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'public_id', e.public_id,
    'user_id', e.user_id,
    'email', p.email,
    'name', p.display_name,
    'contact_phone', e.contact_phone,
    'contact_telegram', e.contact_telegram,
    'created_at', e.created_at,
    'balance', COALESCE(w.units_balance, 0),
    'has_topup', EXISTS(SELECT 1 FROM public.transactions t WHERE t.wallet_id = w.id AND t.type='topup'::public.tx_type),
    'projects_count', (SELECT count(*) FROM public.projects pr WHERE pr.employer_id = e.id),
    'candidates_count', (SELECT count(*) FROM public.candidates c JOIN public.projects pr ON pr.id = c.project_id WHERE pr.employer_id = e.id)
  ) ORDER BY e.created_at DESC), '[]'::jsonb) INTO v
  FROM public.employers e
  LEFT JOIN public.profiles p ON p.id = e.user_id
  LEFT JOIN public.wallets w ON w.employer_id = e.id;
  RETURN v;
END $$;

-- Admin RPC: list candidates (across all employers) with key signals
CREATE OR REPLACE FUNCTION public.admin_list_candidates()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'public_id', c.public_id, 'email', c.email,
    'role_name', c.role_name, 'crm_stage', c.crm_stage, 'current_stage', c.current_stage,
    'created_at', c.created_at,
    'project_id', c.project_id, 'company_id', c.company_id,
    'company_name', co.name, 'project_role', pr.role_name,
    'overall_score', s.overall_score
  ) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v
  FROM public.candidates c
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects pr ON pr.id = c.project_id
  LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id;
  RETURN v;
END $$;

-- Admin RPC: candidate full details (for modal)
CREATE OR REPLACE FUNCTION public.candidate_full_details(_candidate uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.can_view_candidate(_candidate) OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'candidate', to_jsonb(c.*),
    'profile', to_jsonb(p.*),
    'company', to_jsonb(co.*),
    'project', to_jsonb(pr.*),
    'scores', to_jsonb(s.*),
    'answers', COALESCE((SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at) FROM public.candidate_answers a WHERE a.candidate_id = c.id), '[]'::jsonb),
    'stage_progress', COALESCE((SELECT jsonb_agg(to_jsonb(sp.*) ORDER BY sp.created_at) FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id), '[]'::jsonb),
    'training_progress', COALESCE((SELECT jsonb_agg(to_jsonb(tp.*) ORDER BY tp.created_at) FROM public.candidate_training_progress tp WHERE tp.candidate_id = c.id), '[]'::jsonb),
    'interviews', COALESCE((SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at) FROM public.interviews i WHERE i.candidate_id = c.id), '[]'::jsonb)
  ) INTO v
  FROM public.candidates c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.projects pr ON pr.id = c.project_id
  LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
  WHERE c.id = _candidate;
  RETURN v;
END $$;
