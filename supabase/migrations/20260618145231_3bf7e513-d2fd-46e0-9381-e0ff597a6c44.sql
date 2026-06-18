-- Phase 3B-2A.1: resume version columns + atomic save RPC
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS resume_hash text,
  ADD COLUMN IF NOT EXISTS resume_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.save_candidate_resume_text(
  _candidate uuid,
  _resume_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_hash text;
  v_now timestamptz := now();
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _resume_text IS NULL THEN RAISE EXCEPTION 'no_resume_text'; END IF;
  v_clean := LEFT(btrim(_resume_text), 20000);
  IF length(v_clean) < 50 THEN RAISE EXCEPTION 'resume_too_short'; END IF;
  v_hash := encode(digest(convert_to(v_clean, 'UTF8'), 'sha256'), 'hex');

  UPDATE public.candidates
     SET resume_text       = v_clean,
         resume_hash       = v_hash,
         resume_updated_at = v_now
   WHERE id = _candidate;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_not_found'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'resume_hash', v_hash,
    'resume_updated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_candidate_resume_text(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_candidate_resume_text(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_candidate_resume_text(uuid, text) TO service_role;

-- Backfill resume_hash + resume_updated_at for rows that already have resume_text
-- so the worker's hash comparison works for legacy candidates too.
UPDATE public.candidates
   SET resume_hash = encode(digest(convert_to(LEFT(btrim(resume_text), 20000), 'UTF8'), 'sha256'), 'hex'),
       resume_updated_at = COALESCE(resume_updated_at, updated_at, now())
 WHERE resume_text IS NOT NULL
   AND length(btrim(resume_text)) >= 50
   AND resume_hash IS NULL;