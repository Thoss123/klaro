-- Sprint 6 (pulled forward into the Sprint 3–5 hardening pass).
-- Enables Row Level Security on the three user-scoped tables that were still
-- exposed to the anon/authenticated roles, with strict auth.uid() = user_id
-- policies that mirror the existing sessions / project_canvas pattern.
--
-- Applied to live project nxkijeqxkefbrvaanite via Supabase MCP migration
-- `enable_rls_projects_workflows_credentials`. The `rls_disabled` critical
-- advisory is cleared after this runs.

-- ── projects ────────────────────────────────────────────────────────────────
alter table public.projects enable row level security;
create policy "Users can view own projects"   on public.projects for select using (auth.uid() = user_id);
create policy "Users can create own projects" on public.projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own projects" on public.projects for delete using (auth.uid() = user_id);

-- ── workflows ────────────────────────────────────────────────────────────────
alter table public.workflows enable row level security;
create policy "Users can view own workflows"   on public.workflows for select using (auth.uid() = user_id);
create policy "Users can create own workflows" on public.workflows for insert with check (auth.uid() = user_id);
create policy "Users can update own workflows" on public.workflows for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own workflows" on public.workflows for delete using (auth.uid() = user_id);

-- ── user_credentials ────────────────────────────────────────────────────────
alter table public.user_credentials enable row level security;
create policy "Users can view own credentials"   on public.user_credentials for select using (auth.uid() = user_id);
create policy "Users can create own credentials" on public.user_credentials for insert with check (auth.uid() = user_id);
create policy "Users can update own credentials" on public.user_credentials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own credentials" on public.user_credentials for delete using (auth.uid() = user_id);
