CREATE TABLE IF NOT EXISTS public.interview_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_systems_project_id_key UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_systems TO authenticated;
GRANT ALL ON public.interview_systems TO service_role;

ALTER TABLE public.interview_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interview_systems owner select" ON public.interview_systems;
CREATE POLICY "interview_systems owner select"
ON public.interview_systems
FOR SELECT
TO authenticated
USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "interview_systems owner insert" ON public.interview_systems;
CREATE POLICY "interview_systems owner insert"
ON public.interview_systems
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "interview_systems owner update" ON public.interview_systems;
CREATE POLICY "interview_systems owner update"
ON public.interview_systems
FOR UPDATE
TO authenticated
USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "interview_systems owner delete" ON public.interview_systems;
CREATE POLICY "interview_systems owner delete"
ON public.interview_systems
FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS interview_systems_set_updated_at ON public.interview_systems;
CREATE TRIGGER interview_systems_set_updated_at
BEFORE UPDATE ON public.interview_systems
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.interview_systems (project_id, source, created_at, updated_at)
SELECT ib.project_id, 'backfill_blocks', min(ib.created_at), now()
FROM public.interview_blocks ib
GROUP BY ib.project_id
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.interview_systems (project_id, source, created_at, updated_at)
SELECT p.id, 'backfill_paid', min(t.created_at), now()
FROM public.transactions t
JOIN public.projects p ON p.id = t.ref_id
WHERE t.ref_table = 'projects'
  AND t.idem_key LIKE 'fixed:interview_setup:%'
GROUP BY p.id
ON CONFLICT (project_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.spend_fixed(_project uuid, _item text, _prefer text DEFAULT 'credit')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
BEGIN
  IF _item NOT IN ('landing','interview_setup','training_setup') THEN RAISE EXCEPTION 'bad_item'; END IF;
  IF _prefer NOT IN ('credit','balance') THEN _prefer := 'credit'; END IF;

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

  SELECT p.employer_id, e.user_id INTO v_emp, v_user
    FROM public.projects p JOIN public.employers e ON e.id = p.employer_id
    WHERE p.id = _project;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_project'; END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'fixed:' || _item || ':' || _project::text;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    IF _item = 'interview_setup' THEN
      INSERT INTO public.interview_systems (project_id, created_by, status, source)
      VALUES (_project, auth.uid(), 'draft', 'spend_fixed_already')
      ON CONFLICT (project_id) DO UPDATE SET updated_at = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _prefer = 'credit' THEN
    IF _item = 'landing' THEN
      UPDATE public.employers SET landing_credits = landing_credits - 1
        WHERE id = v_emp AND landing_credits > 0
        RETURNING landing_credits INTO v_credits;
    ELSIF _item = 'interview_setup' THEN
      UPDATE public.employers SET interview_setup_credits = interview_setup_credits - 1
        WHERE id = v_emp AND interview_setup_credits > 0
        RETURNING interview_setup_credits INTO v_credits;
    ELSE
      UPDATE public.employers SET training_setup_credits = training_setup_credits - 1
        WHERE id = v_emp AND training_setup_credits > 0
        RETURNING training_setup_credits INTO v_credits;
    END IF;
    v_used_credit := v_credits IS NOT NULL;
  END IF;

  INSERT INTO public.wallets (employer_id) VALUES (v_emp) ON CONFLICT (employer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;

  IF v_used_credit THEN
    INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
    VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'projects', _project,
            v_label || ' (из лимита)', v_idem);
    IF _item = 'interview_setup' THEN
      INSERT INTO public.interview_systems (project_id, created_by, status, source)
      VALUES (_project, auth.uid(), 'draft', 'spend_fixed_credit')
      ON CONFLICT (project_id) DO UPDATE SET updated_at = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'used_credit', true, 'left', v_credits);
  END IF;

  IF v_wallet.units_balance < v_amount THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  UPDATE public.wallets SET units_balance = units_balance - v_amount, updated_at = now() WHERE id = v_wallet.id;
  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, v_amount, 'projects', _project, v_label, v_idem);

  IF _item = 'interview_setup' THEN
    INSERT INTO public.interview_systems (project_id, created_by, status, source)
    VALUES (_project, auth.uid(), 'draft', 'spend_fixed_balance')
    ON CONFLICT (project_id) DO UPDATE SET updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'used_credit', false);
END $$;

REVOKE ALL ON FUNCTION public.spend_fixed(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_fixed(uuid,text,text) TO authenticated, service_role;