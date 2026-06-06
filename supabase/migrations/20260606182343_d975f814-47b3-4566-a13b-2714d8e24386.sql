
CREATE OR REPLACE FUNCTION public.accept_offer(_version text DEFAULT '2026-06-06')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.employers WHERE user_id = auth.uid() LIMIT 1;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_employer'); END IF;
  UPDATE public.employers
     SET offer_accepted = true,
         offer_accepted_at = COALESCE(offer_accepted_at, now()),
         offer_version = COALESCE(offer_version, _version)
   WHERE id = v_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.accept_offer(text) TO authenticated;
