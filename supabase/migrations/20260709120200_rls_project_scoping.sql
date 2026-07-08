-- Tighten RLS: workflows, user_credentials, workspace_files require project ownership.

-- ── workflows ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can create own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete own workflows" ON public.workflows;

CREATE POLICY "Users can view own workflows" ON public.workflows
  FOR SELECT USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create own workflows" ON public.workflows
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own workflows" ON public.workflows
  FOR UPDATE USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own workflows" ON public.workflows
  FOR DELETE USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- ── user_credentials ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "Users can create own credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "Users can update own credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "Users can delete own credentials" ON public.user_credentials;

CREATE POLICY "Users can view own credentials" ON public.user_credentials
  FOR SELECT USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create own credentials" ON public.user_credentials
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own credentials" ON public.user_credentials
  FOR UPDATE USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own credentials" ON public.user_credentials
  FOR DELETE USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- ── workspace_files ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspace_files_own" ON public.workspace_files;

CREATE POLICY "workspace_files_own" ON public.workspace_files
  FOR ALL USING (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    auth.uid() = user_id
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
