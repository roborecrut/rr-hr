CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 50),
  last_name  text NOT NULL CHECK (char_length(last_name)  BETWEEN 1 AND 50),
  content    text NOT NULL CHECK (char_length(content)    BETWEEN 1 AND 500),
  ai_reply    text,
  admin_reply text,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (is_published = true OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "reviews_public_insert" ON public.reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "reviews_admin_update" ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "reviews_admin_delete" ON public.reviews
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();