ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_check CHECK (
    (
      recipient_kind = 'employer'
      AND employer_user_id IS NOT NULL
    )
    OR (
      recipient_kind = 'candidate'
      AND candidate_id IS NOT NULL
      AND employer_user_id IS NULL
    )
  );