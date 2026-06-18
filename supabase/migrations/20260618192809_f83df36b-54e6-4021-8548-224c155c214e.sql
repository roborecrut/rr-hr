
ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS training_summary_score numeric,
  ADD COLUMN IF NOT EXISTS training_summary_source_hash text,
  ADD COLUMN IF NOT EXISTS training_summary_generated_at timestamptz;

CREATE OR REPLACE FUNCTION public.save_candidate_training_summary_v2(
  _candidate_id uuid,
  _employer_feedback jsonb,
  _candidate_feedback jsonb,
  _summary_score numeric,
  _source_hash text,
  _expected_prev_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_hash text;
BEGIN
  SELECT training_summary_source_hash INTO _prev_hash
  FROM public.candidate_scores
  WHERE candidate_id = _candidate_id;

  IF _prev_hash IS DISTINCT FROM _expected_prev_hash THEN
    -- optimistic concurrency: someone updated the source data; force a refresh.
    RAISE EXCEPTION 'source_data_changed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.candidate_scores (
    candidate_id, training_employer_feedback, training_candidate_feedback,
    training_summary_score, training_summary_source_hash, training_summary_generated_at, updated_at
  )
  VALUES (
    _candidate_id, _employer_feedback, _candidate_feedback,
    _summary_score, _source_hash, now(), now()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    training_employer_feedback = EXCLUDED.training_employer_feedback,
    training_candidate_feedback = EXCLUDED.training_candidate_feedback,
    training_summary_score = EXCLUDED.training_summary_score,
    training_summary_source_hash = EXCLUDED.training_summary_source_hash,
    training_summary_generated_at = EXCLUDED.training_summary_generated_at,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'source_hash', _source_hash);
END
$$;

REVOKE ALL ON FUNCTION public.save_candidate_training_summary_v2(uuid, jsonb, jsonb, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_training_summary_v2(uuid, jsonb, jsonb, numeric, text, text) TO service_role;
