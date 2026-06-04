CREATE OR REPLACE FUNCTION public.grant_employer_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (employer_id) VALUES (NEW.id) ON CONFLICT (employer_id) DO NOTHING;
  IF NOT NEW.bonus_granted THEN
    PERFORM public.apply_transaction(NEW.id, 'bonus'::public.tx_type, 1000, 'employers', NEW.id, 'Signup bonus (Google)');
    UPDATE public.employers SET bonus_granted = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;