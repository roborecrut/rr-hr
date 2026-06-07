CREATE OR REPLACE FUNCTION public.logs_fill_tokens_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tokens_total IS NULL THEN
    NEW.tokens_total := COALESCE(NEW.tokens_in_source, 0) + COALESCE(NEW.tokens_out_source, 0);
    IF NEW.tokens_total = 0 AND NEW.tokens_in_source IS NULL AND NEW.tokens_out_source IS NULL THEN
      NEW.tokens_total := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logs_fill_tokens_total ON public.logs;
CREATE TRIGGER trg_logs_fill_tokens_total
BEFORE INSERT OR UPDATE ON public.logs
FOR EACH ROW
EXECUTE FUNCTION public.logs_fill_tokens_total();