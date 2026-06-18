-- Phase 3B-2B Step D1: composite (candidate_id, project_id) PK for checklist v2 answers,
-- matching the situations v2 contract. Additive: 0 rows currently exist (audit confirmed),
-- so no data migration is required. v1 flow remains untouched.

ALTER TABLE public.candidate_checklist_answers_v2
  DROP CONSTRAINT IF EXISTS candidate_checklist_answers_v2_pkey;

ALTER TABLE public.candidate_checklist_answers_v2
  ADD CONSTRAINT candidate_checklist_answers_v2_pkey
  PRIMARY KEY (candidate_id, project_id);

CREATE OR REPLACE FUNCTION public.save_checklist_answers_v2(
  _candidate uuid,
  _project   uuid,
  _answers   jsonb,
  _answers_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF _candidate IS NULL OR _project IS NULL THEN RAISE EXCEPTION 'no_ids'; END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' THEN RAISE EXCEPTION 'bad_answers'; END IF;
  IF _answers_hash IS NULL OR length(_answers_hash) < 16 THEN RAISE EXCEPTION 'bad_hash'; END IF;

  INSERT INTO public.candidate_checklist_answers_v2
    (candidate_id, project_id, answers, answers_hash, updated_at)
  VALUES
    (_candidate, _project, _answers, _answers_hash, v_now)
  ON CONFLICT (candidate_id, project_id) DO UPDATE SET
    answers      = EXCLUDED.answers,
    answers_hash = EXCLUDED.answers_hash,
    updated_at   = v_now;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'project_id', _project,
    'answers_hash', _answers_hash,
    'updated_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) TO service_role;