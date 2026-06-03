-- Sprint 2 — n8n API integration
-- Tables that back app/api/n8n/{workflows,credentials,executions}.
-- These already exist in the current Supabase project; this file documents the
-- schema so a fresh environment can be reproduced, and adds the unique index the
-- credentials upsert depends on.
--
-- RLS: intentionally left DISABLED for Sprint 2 (service-role / logged-in dev user).
-- Strict per-user RLS is Sprint 6 — see roadmap.md.

-- ── workflows ───────────────────────────────────────────────────────────────
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete cascade,
  linked_use_case text,
  n8n_workflow_id text,
  n8n_project_id text,
  name text not null,
  description text,
  workflow_json jsonb,
  status text default 'inactive' check (status in ('active','inactive','error','draft')),
  last_execution_at timestamptz,
  execution_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── user_credentials ────────────────────────────────────────────────────────
create table if not exists user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete cascade,
  tool_name text not null,
  credential_type text default 'api_key' check (credential_type in ('api_key','oauth')),
  encrypted_value text,
  n8n_credential_id text,
  status text default 'active' check (status in ('active','revoked','expired')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Required by the credentials route's upsert (onConflict: user_id,project_id,tool_name).
-- Without this, POST /api/n8n/credentials fails with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
create unique index if not exists user_credentials_user_project_tool_key
  on user_credentials (user_id, project_id, tool_name);
