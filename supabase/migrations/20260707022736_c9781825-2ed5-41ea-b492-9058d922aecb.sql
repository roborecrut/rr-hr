CREATE OR REPLACE FUNCTION public.spend_fixed_for_employer(
  _employer_public_id text,
  _project uuid,
  _item text,
  _prefer text DEFAULT 'credit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_user uuid;
  v_amount int;
  v_idem text;
  v_wallet public.wallets;
  v_label text;
  v_credits int;
  v_used_credit boolean := false;
  v_created_system uuid;
BEGIN
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN
    RAISE EXCEPTION 'bad_item';
  END IF;
  IF _prefer NOT IN ('credit','balance') THEN
    _prefer := 'credit';
  END IF;
  IF coalesce(trim(_employer_public_id), '') = '' THEN
    RAISE EXCEPTION 'bad_employer';
  END IF;

  v_amount := CASE _item
    WHEN 'landing'          THEN 500
    WHEN 'interview_setup'  THEN 200
    WHEN 'training_setup'   THEN 300
  END;
  v_label := CASE _item
    WHEN 'landing'          THEN 'ИИ-Лендинг вакансии'
    WHEN 'interview_setup'  THEN 'ИИ-Система интервью'
    WHEN 'training_setup'   THEN 'ИИ-Система обучения'
  END;

  SELECT p.employer_id, e.user_id
    INTO v_emp, v_user
  FROM public.projects p
  JOIN public.employers e ON e.id = p.employer_id
  WHERE p.id = _project
    AND e.public_id = _employer_public_id;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'project_employer_mismatch';
  END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'fixed:' || _item || ':' || _project::text;

  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.wallets w ON w.id = t.wallet_id
    WHERE t.idem_key = v_idem
      AND w.employer_id = v_emp
  ) THEN
    IF _item = 'interview_setup' THEN
      INSERT INTO public.interview_systems (project_id, created_by, status, source)
      VALUES (_project, auth.uid(), 'draft', 'spend_fixed_already')
      ON CONFLICT (project_id) DO UPDATE
        SET updated_at = now(),
            source = CASE
              WHEN public.interview_systems.source IN ('manual', 'backfill_blocks', 'backfill_paid') THEN excluded.source
              ELSE public.interview_systems.source
            END;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _item = 'interview_setup' THEN
    INSERT INTO public.interview_systems (project_id, created_by, status, source)
    VALUES (_project, auth.uid(), 'draft', 'pending_payment')
    ON CONFLICT (project_id) DO NOTHING
    RETURNING id INTO v_created_system;

    IF v_created_system IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'reason', 'system_exists');
    END IF;
  END IF;

  IF _prefer = 'credit' THEN
    IF _item = 'landing' THEN
      UPDATE public.employers
      SET landing_credits = landing_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND landing_credits > 0
      RETURNING landing_credits INTO v_credits;
    ELSIF _item = 'interview_setup' THEN
      UPDATE public.employers
      SET interview_setup_credits = interview_setup_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND interview_setup_credits > 0
      RETURNING interview_setup_credits INTO v_credits;
    ELSE
      UPDATE public.employers
      SET training_setup_credits = training_setup_credits - 1,
          updated_at = now()
      WHERE id = v_emp
        AND training_setup_credits > 0
      RETURNING training_setup_credits INTO v_credits;
    END IF;
    v_used_credit := v_credits IS NOT NULL;
  END IF;

  INSERT INTO public.wallets (employer_id)
  VALUES (v_emp)
  ON CONFLICT (employer_id) DO NOTHING;

  SELECT *
    INTO v_wallet
  FROM public.wallets
  WHERE employer_id = v_emp
  FOR UPDATE;

  IF v_used_credit THEN
    INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
    VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'projects', _project,
            v_label || ' (из лимита)', v_idem);

    IF _item = 'interview_setup' THEN
      UPDATE public.interview_systems
      SET source = 'spend_fixed_credit', updated_at = now()
      WHERE project_id = _project;
    END IF;

    RETURN jsonb_build_object('ok', true, 'used_credit', true, 'left', v_credits);
  END IF;

  IF v_wallet.units_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  UPDATE public.wallets
  SET units_balance = units_balance - v_amount,
      updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_amount, 'projects', _project, v_label, v_idem);

  IF _item = 'interview_setup' THEN
    UPDATE public.interview_systems
    SET source = 'spend_fixed_balance', updated_at = now()
    WHERE project_id = _project;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'used_credit', false);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_fixed_for_employer(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed_for_employer(text, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.spend_fixed(_project uuid, _item text, _prefer text DEFAULT 'credit')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public text;
BEGIN
  SELECT e.public_id INTO v_public
  FROM public.projects p
  JOIN public.employers e ON e.id = p.employer_id
  WHERE p.id = _project;
  IF v_public IS NULL THEN
    RAISE EXCEPTION 'no_project';
  END IF;
  RETURN public.spend_fixed_for_employer(v_public, _project, _item, _prefer);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_fixed(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_recalc_crm_stage(_id uuid)
RETURNS public.crm_stage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_manual boolean;
  v_stage_text text := 'registration';
  v_resume numeric;
  v_check numeric;
  v_sit numeric;
  v_has_resume boolean := false;
  v_has_check boolean := false;
  v_has_sit boolean := false;
  v_has_interview boolean := false;
  v_pass_score numeric := 75;
  v_avg numeric;
  v_prof_attempt boolean := false;
  v_prof_pass boolean := false;
  v_prod_attempt boolean := false;
  v_prod_pass boolean := false;
  v_sys_attempt boolean := false;
  v_sys_pass boolean := false;
  v_cert boolean := false;
BEGIN
  SELECT crm_stage_manual INTO v_manual FROM public.candidates WHERE id = _id;
  IF v_manual THEN RETURN (SELECT crm_stage FROM public.candidates WHERE id = _id); END IF;

  SELECT EXISTS(SELECT 1 FROM public.interviews WHERE candidate_id = _id AND started_at IS NOT NULL) INTO v_has_interview;

  SELECT
    resume_score,
    checklist_score,
    situations_score,
    COALESCE(resume_feedback, candidate_resume_feedback) IS NOT NULL,
    COALESCE(checklist_feedback, candidate_checklist_feedback) IS NOT NULL,
    COALESCE(situations_feedback, candidate_situations_feedback) IS NOT NULL
  INTO v_resume, v_check, v_sit, v_has_resume, v_has_check, v_has_sit
  FROM public.candidate_scores
  WHERE candidate_id = _id;

  SELECT COALESCE(p.interview_pass_score, 75)
    INTO v_pass_score
  FROM public.candidates c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = _id;

  SELECT
    bool_or(stage = 'professional' AND attempts > 0),
    bool_or(stage = 'professional' AND passed_at IS NOT NULL),
    bool_or(stage = 'product' AND attempts > 0),
    bool_or(stage = 'product' AND passed_at IS NOT NULL),
    bool_or(stage IN ('system','systems') AND attempts > 0),
    bool_or(stage IN ('system','systems') AND passed_at IS NOT NULL)
  INTO v_prof_attempt, v_prof_pass, v_prod_attempt, v_prod_pass, v_sys_attempt, v_sys_pass
  FROM public.candidate_stage_progress
  WHERE candidate_id = _id;

  SELECT EXISTS(SELECT 1 FROM public.certifications cert WHERE cert.candidate_id = _id) INTO v_cert;

  IF COALESCE(v_cert, false) OR COALESCE(v_sys_pass, false) THEN
    v_stage_text := 'certified';
  ELSIF COALESCE(v_sys_attempt, false) OR COALESCE(v_prod_pass, false) THEN
    v_stage_text := 'systems';
  ELSIF COALESCE(v_prod_attempt, false) OR COALESCE(v_prof_pass, false) THEN
    v_stage_text := 'product';
  ELSIF COALESCE(v_prof_attempt, false) THEN
    v_stage_text := 'professional';
  ELSIF COALESCE(v_has_resume, false) AND COALESCE(v_has_check, false) AND COALESCE(v_has_sit, false) THEN
    v_avg := ROUND(((COALESCE(v_resume, 0) + COALESCE(v_check, 0) + COALESCE(v_sit, 0)) / 3.0)::numeric, 2);
    IF v_avg >= COALESCE(v_pass_score, 75) THEN
      v_stage_text := 'interview_success';
    ELSE
      v_stage_text := 'interview_reject';
    END IF;
  ELSIF COALESCE(v_has_check, false) AND COALESCE(v_check, 0) >= COALESCE(v_pass_score, 75) THEN
    v_stage_text := 'situations';
  ELSIF COALESCE(v_has_resume, false) OR COALESCE(v_has_check, false) THEN
    v_stage_text := 'checklist';
  ELSIF v_has_interview OR EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = _id AND (NULLIF(c.resume_text, '') IS NOT NULL OR c.resume_url IS NOT NULL)) THEN
    v_stage_text := 'screening';
  ELSE
    v_stage_text := 'registration';
  END IF;

  UPDATE public.candidates
  SET crm_stage = v_stage_text::public.crm_stage
  WHERE id = _id AND crm_stage <> v_stage_text::public.crm_stage;

  RETURN v_stage_text::public.crm_stage;
END;
$$;

CREATE OR REPLACE FUNCTION public.employer_list_candidates()
RETURNS TABLE (
  id uuid,
  public_id text,
  project_id uuid,
  project_public_id text,
  role_name text,
  company_id uuid,
  company_name text,
  company_slug text,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz,
  last_login_at timestamptz,
  current_stage text,
  crm_stage text,
  crm_stage_manual boolean,
  registered_via text,
  resume_score numeric,
  checklist_score numeric,
  situations_score numeric,
  interview_score numeric,
  overall_score numeric,
  has_resume boolean,
  has_checklist boolean,
  has_situations boolean,
  has_overall boolean,
  training_passed text[],
  certified boolean,
  derived_stage text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT e.id INTO v_emp FROM public.employers e WHERE e.user_id = auth.uid() LIMIT 1;
  IF v_emp IS NULL AND NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.public_id,
      c.project_id,
      p.public_id AS project_public_id,
      COALESCE(NULLIF(c.role_name,''), p.role_name) AS role_name,
      c.company_id,
      co.name AS company_name,
      co.slug AS company_slug,
      c.full_name,
      c.email,
      c.phone,
      c.avatar_url,
      c.created_at,
      c.last_login_at,
      c.current_stage::text AS current_stage,
      c.crm_stage::text AS crm_stage,
      COALESCE(c.crm_stage_manual, false) AS crm_stage_manual,
      c.registered_via::text AS registered_via,
      cs.resume_score,
      cs.checklist_score,
      cs.situations_score,
      cs.interview_score,
      cs.overall_score,
      COALESCE(cs.resume_feedback, cs.candidate_resume_feedback) IS NOT NULL AS has_resume,
      COALESCE(cs.checklist_feedback, cs.candidate_checklist_feedback) IS NOT NULL AS has_checklist,
      COALESCE(cs.situations_feedback, cs.candidate_situations_feedback) IS NOT NULL AS has_situations,
      cs.overall_generated_at IS NOT NULL AS has_overall,
      COALESCE((
        SELECT array_agg(sp.stage ORDER BY sp.stage)
        FROM public.candidate_stage_progress sp
        WHERE sp.candidate_id = c.id AND sp.passed_at IS NOT NULL
      ), ARRAY[]::text[]) AS training_passed,
      EXISTS (SELECT 1 FROM public.certifications cert WHERE cert.candidate_id = c.id) AS certified,
      COALESCE(p.interview_pass_score, 75) AS pass_score,
      EXISTS (SELECT 1 FROM public.interviews i WHERE i.candidate_id = c.id AND i.started_at IS NOT NULL) AS has_interview,
      NULLIF(c.resume_text, '') IS NOT NULL OR c.resume_url IS NOT NULL AS has_resume_text,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage = 'professional' AND sp.attempts > 0) AS prof_attempt,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage = 'professional' AND sp.passed_at IS NOT NULL) AS prof_pass,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage = 'product' AND sp.attempts > 0) AS prod_attempt,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage = 'product' AND sp.passed_at IS NOT NULL) AS prod_pass,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage IN ('system','systems') AND sp.attempts > 0) AS sys_attempt,
      EXISTS (SELECT 1 FROM public.candidate_stage_progress sp WHERE sp.candidate_id = c.id AND sp.stage IN ('system','systems') AND sp.passed_at IS NOT NULL) AS sys_pass
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    LEFT JOIN public.companies co ON co.id = c.company_id
    LEFT JOIN public.candidate_scores cs ON cs.candidate_id = c.id
    WHERE v_is_admin OR p.employer_id = v_emp
  )
  SELECT
    b.id,
    b.public_id,
    b.project_id,
    b.project_public_id,
    b.role_name,
    b.company_id,
    b.company_name,
    b.company_slug,
    b.full_name,
    b.email,
    b.phone,
    b.avatar_url,
    b.created_at,
    b.last_login_at,
    b.current_stage,
    b.crm_stage,
    b.crm_stage_manual,
    b.registered_via,
    b.resume_score,
    b.checklist_score,
    b.situations_score,
    b.interview_score,
    b.overall_score,
    b.has_resume,
    b.has_checklist,
    b.has_situations,
    b.has_overall,
    b.training_passed,
    (b.certified OR b.sys_pass),
    CASE
      WHEN b.certified OR b.sys_pass THEN 'certified'
      WHEN b.sys_attempt OR b.prod_pass THEN 'systems'
      WHEN b.prod_attempt OR b.prof_pass THEN 'product'
      WHEN b.prof_attempt THEN 'professional'
      WHEN b.has_resume AND b.has_checklist AND b.has_situations AND ROUND(((COALESCE(b.resume_score, 0) + COALESCE(b.checklist_score, 0) + COALESCE(b.situations_score, 0)) / 3.0)::numeric, 2) >= b.pass_score THEN 'interview_success'
      WHEN b.has_resume AND b.has_checklist AND b.has_situations THEN 'interview_reject'
      WHEN b.has_checklist AND COALESCE(b.checklist_score, 0) >= b.pass_score THEN 'situations'
      WHEN b.has_resume OR b.has_checklist THEN 'checklist'
      WHEN b.has_interview OR b.has_resume_text THEN 'screening'
      ELSE 'registration'
    END AS derived_stage
  FROM base b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.employer_list_candidates() TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.candidates WHERE COALESCE(crm_stage_manual, false) = false LOOP
    PERFORM public.candidate_recalc_crm_stage(r.id);
  END LOOP;
END $$;