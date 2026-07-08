-- Make chat-uploads bucket private; only owner can read their files.

UPDATE storage.buckets SET public = false WHERE id = 'chat-uploads';

DROP POLICY IF EXISTS "chat uploads select public" ON storage.objects;

DROP POLICY IF EXISTS "chat uploads select own" ON storage.objects;
CREATE POLICY "chat uploads select own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
