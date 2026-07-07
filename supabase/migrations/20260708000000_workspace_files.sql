-- Workspace-Files: virtuelles Filesystem pro Projekt/User (auf der DB)
-- Hier liegen die Agent-Regel-Dateien (rules/company_base.md, rules/persona_<name>.md),
-- die der n8n-Agent zur Laufzeit liest und Flow 2 (Learning Engine) laufend konsolidierend
-- umschreibt. Der `path`-Präfix ergibt die Verzeichnis-Semantik ('rules/…', später 'data/…').

CREATE TABLE IF NOT EXISTS workspace_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,                      -- 'rules/company_base.md', 'rules/persona_thomas.md'
  content     TEXT NOT NULL DEFAULT '',
  version     INT  NOT NULL DEFAULT 1,            -- Flow 2 inkrementiert beim Umschreiben (via Trigger)
  updated_by  TEXT NOT NULL DEFAULT 'system',     -- 'axantilo' | 'flow2' | user-id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_files_path_unique UNIQUE (project_id, path)
);

CREATE INDEX IF NOT EXISTS workspace_files_user_idx ON workspace_files (user_id);
CREATE INDEX IF NOT EXISTS workspace_files_project_path_idx ON workspace_files (project_id, path);

-- ── Version + updated_at automatisch beim UPDATE hochzählen ────────────────
-- So bleibt writeWorkspaceFile() einfach (kein Read-modify-write der Version) und
-- die Inkrementierung ist innerhalb des Row-Locks des UPDATE atomar.
CREATE OR REPLACE FUNCTION bump_workspace_file_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''  -- Härtung: kein veränderbarer search_path (Supabase-Linter 0011)
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_files_bump_version ON workspace_files;
CREATE TRIGGER workspace_files_bump_version
  BEFORE UPDATE ON workspace_files
  FOR EACH ROW EXECUTE FUNCTION bump_workspace_file_version();

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_files_own" ON workspace_files;
CREATE POLICY "workspace_files_own" ON workspace_files
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
