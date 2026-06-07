
-- 1) Grants missing on candidate_scores — anon/authenticated couldn't SELECT scores
GRANT SELECT, INSERT, UPDATE ON public.candidate_scores TO anon, authenticated;
GRANT ALL ON public.candidate_scores TO service_role;

-- 2) Localize transaction note from spend_pack to include vacancy + candidate name
CREATE OR REPLACE FUNCTION public.spend_pack(_candidate uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_user uuid;
  v_proj_id uuid;
  v_role_name text;
  v_cand_name text;
  v_cand_pub text;
  v_left int;
  v_idem text;
  v_wallet public.wallets;
  v_kind_ru text;
  v_note text;
BEGIN
  IF _kind NOT IN ('interview','training') THEN
    RAISE EXCEPTION 'bad_kind';
  END IF;

  SELECT c.user_id, p.employer_id, p.id, p.role_name,
         COALESCE(NULLIF(TRIM(c.full_name),''), NULLIF(TRIM(c.resume_name),''), c.email, 'кандидат'),
         c.public_id
    INTO v_user, v_emp, v_proj_id, v_role_name, v_cand_name, v_cand_pub
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = _candidate;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;

  IF NOT (auth.uid() = v_user OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_idem := 'pack:' || _kind || ':' || _candidate::text;

  IF EXISTS (SELECT 1 FROM public.transactions WHERE idem_key = v_idem) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF _kind = 'interview' THEN
    UPDATE public.employers SET interview_credits = interview_credits - 1
      WHERE id = v_emp AND interview_credits > 0
      RETURNING interview_credits INTO v_left;
  ELSE
    UPDATE public.employers SET training_credits = training_credits - 1
      WHERE id = v_emp AND training_credits > 0
      RETURNING training_credits INTO v_left;
  END IF;

  IF v_left IS NULL THEN
    RAISE EXCEPTION 'no_credits';
  END IF;

  v_kind_ru := CASE _kind WHEN 'interview' THEN 'ИИ-интервью' ELSE 'ИИ-обучение' END;
  v_note := 'Списан лимит: ' || v_kind_ru
            || ' · вакансия «' || COALESCE(v_role_name, 'без названия') || '»'
            || ' · кандидат: ' || v_cand_name
            || COALESCE(' (#' || v_cand_pub || ')', '');

  SELECT * INTO v_wallet FROM public.wallets WHERE employer_id = v_emp FOR UPDATE;
  INSERT INTO public.transactions (wallet_id, type, amount_rr, ref_table, ref_id, note, idem_key)
  VALUES (v_wallet.id, 'purchase'::public.tx_type, 0, 'candidates', _candidate, v_note, v_idem);

  RETURN jsonb_build_object('ok', true, 'left', v_left);
END $$;
