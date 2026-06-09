-- Run in Supabase SQL editor if sessions table already exists
alter table sessions add column if not exists vorname text;
alter table sessions add column if not exists firmenname text;
alter table sessions add column if not exists rolle_im_unternehmen text;
