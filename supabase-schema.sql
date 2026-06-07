create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
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

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  created_at timestamp default now()
);

create table canvas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade unique,
  data jsonb default '{}',
  updated_at timestamp default now()
);

-- Project-level canvas: persists across all sessions in a project
create table project_canvas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade unique not null,
  data jsonb default '{"pain_points":[],"use_cases":[],"documents":[]}',
  updated_at timestamp default now()
);

-- Project-level memory: stores phase summaries for cross-chat knowledge
create table project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  phase text not null,
  summary text not null,
  created_at timestamp default now()
);

-- RLS: messages DELETE required for /api/dev/reset-phase
-- policy "Users can delete own messages" — session_id in own sessions
