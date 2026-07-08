-- Core chat tables: RLS policies mirroring the app-layer ownership model.
-- Previously applied live via Supabase MCP but missing from repo migrations.

-- ── sessions ────────────────────────────────────────────────────────────────
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_delete_own" ON public.sessions;
CREATE POLICY "sessions_delete_own" ON public.sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ── messages ────────────────────────────────────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  ) WITH CHECK (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages
  FOR DELETE USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

-- ── canvas (session-scoped) ─────────────────────────────────────────────────
ALTER TABLE public.canvas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_select_own" ON public.canvas;
CREATE POLICY "canvas_select_own" ON public.canvas
  FOR SELECT USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "canvas_insert_own" ON public.canvas;
CREATE POLICY "canvas_insert_own" ON public.canvas
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "canvas_update_own" ON public.canvas;
CREATE POLICY "canvas_update_own" ON public.canvas
  FOR UPDATE USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  ) WITH CHECK (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "canvas_delete_own" ON public.canvas;
CREATE POLICY "canvas_delete_own" ON public.canvas
  FOR DELETE USING (
    session_id IN (SELECT id FROM public.sessions WHERE user_id = auth.uid())
  );

-- ── project_canvas ──────────────────────────────────────────────────────────
ALTER TABLE public.project_canvas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_canvas_select_own" ON public.project_canvas;
CREATE POLICY "project_canvas_select_own" ON public.project_canvas
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_canvas_insert_own" ON public.project_canvas;
CREATE POLICY "project_canvas_insert_own" ON public.project_canvas
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_canvas_update_own" ON public.project_canvas;
CREATE POLICY "project_canvas_update_own" ON public.project_canvas
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_canvas_delete_own" ON public.project_canvas;
CREATE POLICY "project_canvas_delete_own" ON public.project_canvas
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- ── project_memory ──────────────────────────────────────────────────────────
ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_memory_select_own" ON public.project_memory;
CREATE POLICY "project_memory_select_own" ON public.project_memory
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_memory_insert_own" ON public.project_memory;
CREATE POLICY "project_memory_insert_own" ON public.project_memory
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_memory_update_own" ON public.project_memory;
CREATE POLICY "project_memory_update_own" ON public.project_memory
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_memory_delete_own" ON public.project_memory;
CREATE POLICY "project_memory_delete_own" ON public.project_memory
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- ── knowledge_base: drop permissive authenticated write ─────────────────────
DROP POLICY IF EXISTS "kb_write_auth" ON public.knowledge_base;
