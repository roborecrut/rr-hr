ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS hh_post_text       text,
  ADD COLUMN IF NOT EXISTS hh_invite_text     text,
  ADD COLUMN IF NOT EXISTS hh_autoresume_text text;