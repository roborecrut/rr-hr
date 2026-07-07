CREATE OR REPLACE FUNCTION public.tg_notify_employer_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
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

  PERFORM net.http_post(
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
  RETURN NEW;
END;
$$;