-- Run in Supabase SQL editor if sessions table already exists
alter table sessions add column if not exists firmen_recherche text;
