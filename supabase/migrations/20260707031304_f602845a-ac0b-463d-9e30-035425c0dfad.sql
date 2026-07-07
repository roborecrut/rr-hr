-- 1) Enable pg_net for HTTP calls from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) Add telegram_chat_id to employers
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

COMMENT ON COLUMN public.employers.telegram_chat_id IS
  'Numeric Telegram user/chat ID for notification duplication via @RoboRecrutBot.';

-- 3) Trigger function: on new employer-facing notification → invoke edge function
CREATE OR REPLACE FUNCTION public.tg_notify_employer_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _chat_id BIGINT;
  _url TEXT := 'https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/telegram-notify-employer';
BEGIN
  IF NEW.recipient_kind IS DISTINCT FROM 'employer' THEN
    RETURN NEW;
  END IF;
  IF NEW.employer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT telegram_chat_id INTO _chat_id
    FROM public.employers
   WHERE user_id = NEW.employer_user_id
   LIMIT 1;

  IF _chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'chat_id', _chat_id,
      'title', NEW.title,
      'body', NEW.body
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the notification insert on network failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_employer_telegram ON public.notifications;
CREATE TRIGGER trg_notify_employer_telegram
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.tg_notify_employer_dispatch();