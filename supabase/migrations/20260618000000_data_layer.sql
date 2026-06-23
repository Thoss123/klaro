-- Data Layer: Datenablage pro Account (auto-provisioned via Supabase)
-- Jedes Projekt bekommt automatisch eine Datenablage für Automationsdaten,
-- sofern der Nutzer nicht bereits eine eigene Lösung hat (CRM, DB, Sheets).

-- ── Datenquelle pro Projekt (eine pro Projekt, idempotent) ────────────────
CREATE TABLE IF NOT EXISTS user_data_layer (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type      TEXT NOT NULL DEFAULT 'supabase',
  -- 'supabase' = Axantilo-Auto-Provisioning | 'custom' = Nutzer hat eigene Lösung
  source_name      TEXT,           -- z.B. "HubSpot", "Google Sheets", "eigene MySQL"
  auto_provisioned BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,           -- Freitext aus Phase-2-Gespräch
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_data_layer_project_unique UNIQUE (project_id)
);

-- ── Tabellen-Definitionen (nur für source_type = 'supabase') ─────────────
CREATE TABLE IF NOT EXISTS user_data_tables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id     UUID NOT NULL REFERENCES user_data_layer(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  table_name   TEXT NOT NULL,      -- machine-readable: 'automation_data'
  display_name TEXT NOT NULL,      -- human-readable: 'Automationsdaten'
  description  TEXT,
  schema_def   JSONB NOT NULL DEFAULT '[]',  -- [{ "name": "email", "type": "text" }]
  row_count    INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_data_tables_project_name_unique UNIQUE (project_id, table_name)
);

-- ── Datenzeilen (JSONB, schemaflexibel) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_data_rows (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id           UUID NOT NULL REFERENCES user_data_tables(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data               JSONB NOT NULL DEFAULT '{}',
  source_workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indizes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_data_layer_user_idx ON user_data_layer (user_id);
CREATE INDEX IF NOT EXISTS user_data_tables_layer_idx ON user_data_tables (layer_id);
CREATE INDEX IF NOT EXISTS user_data_rows_table_idx ON user_data_rows (table_id);
CREATE INDEX IF NOT EXISTS user_data_rows_workflow_idx ON user_data_rows (source_workflow_id) WHERE source_workflow_id IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE user_data_layer ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_data_layer_own" ON user_data_layer
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data_tables_own" ON user_data_tables
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data_rows_own" ON user_data_rows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
