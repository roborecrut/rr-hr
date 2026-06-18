
ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS overall_source_hash text;

CREATE OR REPLACE FUNCTION public.save_candidate_overall_evaluation_v2(
  _candidate uuid,
  _ai_fit_score integer,
  _employer_feedback jsonb,
  _candidate_feedback jsonb,
  _source_hash text,
  _expected_prev_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_score numeric;
  v_existing text;
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _ai_fit_score IS NULL OR _ai_fit_score < 0 OR _ai_fit_score > 100 THEN
    RAISE EXCEPTION 'bad_score';
  END IF;
  IF _employer_feedback IS NULL OR jsonb_typeof(_employer_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_employer_feedback';
  END IF;
  IF _candidate_feedback IS NULL OR jsonb_typeof(_candidate_feedback) <> 'object' THEN
    RAISE EXCEPTION 'bad_candidate_feedback';
  END IF;
  IF _source_hash IS NULL OR length(_source_hash) < 8 THEN
    RAISE EXCEPTION 'bad_source_hash';
  END IF;

  SELECT overall_source_hash INTO v_existing
    FROM public.candidate_scores WHERE candidate_id = _candidate FOR UPDATE;

  IF _expected_prev_hash IS NOT NULL
     AND v_existing IS NOT NULL
     AND v_existing <> _expected_prev_hash THEN
    RAISE EXCEPTION 'source_data_changed';
  END IF;

  v_score := _ai_fit_score::numeric;

  INSERT INTO public.candidate_scores AS cs (
    candidate_id, ai_fit_score, employer_overall_feedback,
    candidate_overall_feedback, overall_generated_at, overall_source_hash,
    updated_at
  ) VALUES (
    _candidate, v_score, _employer_feedback, _candidate_feedback,
    now(), _source_hash, now()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    ai_fit_score               = EXCLUDED.ai_fit_score,
    employer_overall_feedback  = EXCLUDED.employer_overall_feedback,
    candidate_overall_feedback = EXCLUDED.candidate_overall_feedback,
    overall_generated_at       = now(),
    overall_source_hash        = EXCLUDED.overall_source_hash,
    updated_at                 = now();

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'ai_fit_score', v_score,
    'overall_generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_candidate_overall_evaluation_v2(uuid, integer, jsonb, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_overall_evaluation_v2(uuid, integer, jsonb, jsonb, text, text) TO service_role;
