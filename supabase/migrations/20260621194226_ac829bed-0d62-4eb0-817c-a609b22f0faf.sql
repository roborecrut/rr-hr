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
  -- md5 — встроенная функция, не требует расширения pgcrypto. Используется
  -- только как маркер версии текста (не для крипто-целей), коллизии нам не
  -- критичны.
  v_hash := md5(v_clean);

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