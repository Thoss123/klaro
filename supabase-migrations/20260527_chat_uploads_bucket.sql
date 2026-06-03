-- Storage bucket for chat attachments (images + documents)
insert into storage.buckets (id, name, public)
values ('chat-uploads', 'chat-uploads', true)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "chat uploads insert own"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "chat uploads select public"
on storage.objects for select to public
using (bucket_id = 'chat-uploads');
