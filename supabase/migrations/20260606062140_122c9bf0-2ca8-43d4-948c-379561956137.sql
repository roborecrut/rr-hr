
CREATE OR REPLACE FUNCTION public.candidate_update_profile(
  _token uuid,
  _patch jsonb DEFAULT '{}'::jsonb,
  _new_email text DEFAULT NULL,
  _new_password text DEFAULT NULL,
  _current_password text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_cand_id uuid;
  v_cand public.candidates;
  v_norm_email text;
  v_hash text;
BEGIN
  IF _token IS NULL THEN RETURN jsonb_build_object('ok',false,'error','no_token'); END IF;

  SELECT candidate_id INTO v_cand_id FROM public.candidate_sessions
   WHERE token = _token
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;
  IF v_cand_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','bad_token'); END IF;

  SELECT * INTO v_cand FROM public.candidates WHERE id = v_cand_id;
  IF v_cand.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','no_candidate'); END IF;

  -- Whitelisted profile fields
  UPDATE public.candidates SET
    phone            = COALESCE(_patch->>'phone', phone),
    resume_url       = COALESCE(_patch->>'resume_url', resume_url),
    avatar_url       = COALESCE(_patch->>'avatar_url', avatar_url),
    social_telegram  = COALESCE(_patch->>'social_telegram', social_telegram),
    social_whatsapp  = COALESCE(_patch->>'social_whatsapp', social_whatsapp),
    social_instagram = COALESCE(_patch->>'social_instagram', social_instagram),
    social_vk        = COALESCE(_patch->>'social_vk', social_vk),
    social_max       = COALESCE(_patch->>'social_max', social_max),
    social_setka     = COALESCE(_patch->>'social_setka', social_setka),
    social_github    = COALESCE(_patch->>'social_github', social_github)
   WHERE id = v_cand_id;

  -- Optional: change email (applies to ALL applications of this person)
  IF _new_email IS NOT NULL AND length(trim(_new_email)) > 0 THEN
    v_norm_email := lower(trim(_new_email));
    IF v_norm_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN jsonb_build_object('ok',false,'error','bad_email');
    END IF;
    IF v_norm_email <> lower(v_cand.email) THEN
      IF EXISTS (
        SELECT 1 FROM public.candidates
         WHERE lower(email) = v_norm_email
           AND lower(email) <> lower(v_cand.email)
      ) THEN
        RETURN jsonb_build_object('ok',false,'error','email_taken');
      END IF;
      UPDATE public.candidates SET email = v_norm_email
        WHERE lower(email) = lower(v_cand.email);
    END IF;
  END IF;

  -- Optional: change password (requires current password)
  IF _new_password IS NOT NULL AND length(_new_password) > 0 THEN
    IF length(_new_password) < 8 THEN
      RETURN jsonb_build_object('ok',false,'error','bad_password');
    END IF;
    IF v_cand.password_hash IS NULL
       OR _current_password IS NULL
       OR v_cand.password_hash <> extensions.crypt(_current_password, v_cand.password_hash) THEN
      RETURN jsonb_build_object('ok',false,'error','wrong_current_password');
    END IF;
    v_hash := extensions.crypt(_new_password, extensions.gen_salt('bf'));
    UPDATE public.candidates SET password_hash = v_hash
     WHERE lower(email) = lower(COALESCE(_new_email, v_cand.email));
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.candidate_update_profile(uuid, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_update_profile(uuid, jsonb, text, text, text) TO anon, authenticated;
