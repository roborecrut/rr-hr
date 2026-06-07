
-- Sequence for public_id starting at 700001
CREATE SEQUENCE IF NOT EXISTS public.seq_post_pid START 700001;

-- ============== POSTS ==============
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE,
  slug text UNIQUE,
  title text NOT NULL DEFAULT '',
  cover_url text,
  content_md text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_public_read" ON public.posts
  FOR SELECT USING (is_published = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "posts_admin_all" ON public.posts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Trigger: set public_id, slug and excerpt
CREATE OR REPLACE FUNCTION public.posts_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clean text;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := nextval('public.seq_post_pid')::text;
  END IF;
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := NEW.public_id;
  END IF;

  -- Auto excerpt: strip markdown to plain, take first 100 chars
  v_clean := COALESCE(NEW.content_md, '');
  v_clean := regexp_replace(v_clean, '```[\s\S]*?```', ' ', 'g');     -- code blocks
  v_clean := regexp_replace(v_clean, '!\[[^\]]*\]\([^\)]*\)', ' ', 'g'); -- images
  v_clean := regexp_replace(v_clean, '\[([^\]]+)\]\([^\)]*\)', '\1', 'g'); -- links
  v_clean := regexp_replace(v_clean, '[#>*_`~\-]+', ' ', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  v_clean := btrim(v_clean);
  NEW.excerpt := left(v_clean, 100);

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER posts_before_write_trg
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_before_write();

CREATE INDEX posts_published_idx ON public.posts(is_published, created_at DESC);

-- ============== COMMENTS ==============
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.post_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_public_read" ON public.post_comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_self" ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_update_self" ON public.post_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "comments_delete_self" ON public.post_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER post_comments_set_updated_at
BEFORE UPDATE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX post_comments_post_idx ON public.post_comments(post_id, created_at);

-- ============== REACTIONS ==============
CREATE TABLE public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','fire','heart','clap','wow')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX post_reactions_unique_post
  ON public.post_reactions(user_id, post_id, kind) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX post_reactions_unique_comment
  ON public.post_reactions(user_id, comment_id, kind) WHERE comment_id IS NOT NULL;

GRANT SELECT ON public.post_reactions TO anon;
GRANT SELECT, INSERT, DELETE ON public.post_reactions TO authenticated;
GRANT ALL ON public.post_reactions TO service_role;

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_public_read" ON public.post_reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions_insert_self" ON public.post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_self" ON public.post_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
