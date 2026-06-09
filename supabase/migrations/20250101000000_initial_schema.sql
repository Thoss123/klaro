-- Baseline schema (formerly supabase-schema.sql)

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  ziel text,
  ki_erfahrung text,
  wer_setzt_um text,
  hindernis text,
  branche text,
  tempo text,
  unternehmensgroesse text,
  vorname text,
  firmenname text,
  rolle_im_unternehmen text,
  phase text default 'diagnose',
  title text,
  user_id uuid,
  welcome_sent boolean default false,
  memory text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  created_at timestamp default now()
);

create table public.canvas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade unique,
  data jsonb default '{}',
  updated_at timestamp default now()
);

create table public.project_canvas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade unique not null,
  data jsonb default '{"pain_points":[],"use_cases":[],"documents":[]}',
  updated_at timestamp default now()
);

create table public.project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  phase text not null,
  summary text not null,
  created_at timestamp default now()
);
