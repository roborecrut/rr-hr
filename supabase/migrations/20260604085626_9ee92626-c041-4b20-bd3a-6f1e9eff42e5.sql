
-- 1) Restore trigger on auth.users -> public.handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Extend log_telegram_event to accept new diagnostic kinds
CREATE OR REPLACE FUNCTION public.log_telegram_event(
  _kind text,
  _source text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _intent text DEFAULT NULL,
  _host text DEFAULT NULL,
  _path text DEFAULT NULL,
  _next_path text DEFAULT NULL,
  _vacancy_count integer DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF _kind NOT IN (
    'route_decision','next_reject','whitelist_reject',
    'rate_limited','turnstile_fail','start_failed','miniapp_failed',
    'miniapp_no_init_data','miniapp_bad_signature','miniapp_create_failed',
    'miniapp_link_failed','miniapp_session_failed','miniapp_redirect',
    'callback_failed','oidc_click','oidc_url_failed','oidc_network_error',
    'oidc_verify_failed','done_redirect'
  ) THEN
    RAISE EXCEPTION 'forbidden_kind';
  END IF;
  IF length(coalesce(_path,'')) > 512 OR length(coalesce(_next_path,'')) > 1024 THEN
    RAISE EXCEPTION 'path_too_long';
  END IF;
  INSERT INTO public.telegram_events(kind, source, reason, intent, host, path, next_path, vacancy_count, meta)
  VALUES (_kind, _source, _reason, _intent, _host, _path, _next_path, _vacancy_count, coalesce(_meta,'{}'::jsonb));
END
$function$;
