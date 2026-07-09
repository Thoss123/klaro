-- user_data_rows: project_id direkt auf die Zeile (statt nur über table_id → user_data_tables
-- zu joinen) — die neue /api/agent/data-Route (n8n-Datenablage) braucht schnellen,
-- projekt-scoped Zugriff ohne Join, genau wie agent_pending_actions und workspace_files.

ALTER TABLE user_data_rows
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Backfill bestehender Zeilen aus der zugehörigen Tabelle.
UPDATE user_data_rows r
SET project_id = t.project_id
FROM user_data_tables t
WHERE r.table_id = t.id AND r.project_id IS NULL;

ALTER TABLE user_data_rows ALTER COLUMN project_id SET NOT NULL;

-- ── Indizes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_data_rows_project_idx ON user_data_rows (project_id);
CREATE INDEX IF NOT EXISTS user_data_rows_data_gin_idx ON user_data_rows USING GIN (data);
-- (user_data_rows_table_idx auf table_id existiert bereits aus 20260618000000_data_layer.sql)
