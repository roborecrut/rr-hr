CREATE POLICY "Authenticated users can upload company documents in own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can read company documents in own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete company documents in own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can upload vacancy documents in own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vacancy-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can read vacancy documents in own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vacancy-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete vacancy documents in own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vacancy-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can upload training documents in own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can read training documents in own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete training documents in own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'training-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can upload interview documents in own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'interview-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can read interview documents in own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'interview-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete interview documents in own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'interview-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Candidates can upload resumes in own candidate folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'candidate-resumes'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Candidates can read resumes in own candidate folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'candidate-resumes'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Candidates can delete resumes in own candidate folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-resumes'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Candidates can upload avatars in own candidate folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'candidate-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Candidates can read avatars in own candidate folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'candidate-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Candidates can delete avatars in own candidate folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'candidate-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM public.candidates c WHERE c.user_id = auth.uid()
  )
);