GRANT SELECT ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;

DROP POLICY IF EXISTS "posts storage admin read" ON storage.objects;
DROP POLICY IF EXISTS "posts storage admin insert" ON storage.objects;
DROP POLICY IF EXISTS "posts storage admin update" ON storage.objects;
DROP POLICY IF EXISTS "posts storage admin delete" ON storage.objects;

CREATE POLICY "posts storage admin read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'posts'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "posts storage admin insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'posts'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "posts storage admin update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'posts'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'posts'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "posts storage admin delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'posts'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);