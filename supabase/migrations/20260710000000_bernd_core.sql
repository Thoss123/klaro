-- Bernd-Kern-Datenmodell: Instanz-Konfiguration, Kanal-Pairing, Router-Konversations-State.
-- Ein Betrieb = ein `project` (kein separates company_id; n8n-Isolation über n8n-Projects).
-- Konvention wie bestehend: user_id + project_id, RLS `auth.uid() = user_id`.

-- ── bernd_configs ────────────────────────────────────────────────────────
-- Strukturierte Bernd-Instanz-Konfiguration, 1:1 zu projects. Teil des "Arbeitsbereichs"
-- eines Betriebs (zusammen mit workspace_files, user_credentials, workflows) — Onboarding,
-- Dashboard, Änderungs-Chat und Telegram-Router lesen/schreiben dieselbe Zeile.
CREATE TABLE IF NOT EXISTS bernd_configs (
  project_id        UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gewerk            TEXT,                          -- elektriker | maler | shk | tischler | ...
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | active | paused
  preislogik        JSONB NOT NULL DEFAULT '{}',    -- { stundensatz, materialaufschlag, anfahrt, ... }
  tools             JSONB NOT NULL DEFAULT '{}',    -- angebundene Tools/CRM/Mail (Anzeige + Onboarding)
  notify_rules      JSONB NOT NULL DEFAULT '{}',    -- { email_categories_notify: [...], mute: [...] }
  active_templates  JSONB NOT NULL DEFAULT '[]',    -- [{ slug, n8n_workflow_id, scalars }]
  steckbrief        JSONB NOT NULL DEFAULT '{}',    -- generierte Kann-Liste/Kanäle fürs Dashboard
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bernd_configs_user_idx ON bernd_configs (user_id);

-- ── updated_at automatisch beim UPDATE hochziehen (gehärtet wie workspace_files) ────────
CREATE OR REPLACE FUNCTION bump_bernd_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''  -- Härtung: kein veränderbarer search_path (Supabase-Linter 0011)
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bernd_configs_bump_updated_at ON bernd_configs;
CREATE TRIGGER bernd_configs_bump_updated_at
  BEFORE UPDATE ON bernd_configs
  FOR EACH ROW EXECUTE FUNCTION bump_bernd_config_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE bernd_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bernd_configs_own" ON bernd_configs;
CREATE POLICY "bernd_configs_own" ON bernd_configs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── bernd_channel_links ───────────────────────────────────────────────────
-- Mandanten-Routing für den GETEILTEN Telegram-Bot: Telegram-Identität → Projekt.
-- Pairing per Deep-Link (`t.me/<bot>?start=<pairing_code>`); `verified_at` wird beim
-- ersten bestätigten Inbound gesetzt.
CREATE TABLE IF NOT EXISTS bernd_channel_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'telegram',
  chat_id       TEXT NOT NULL,             -- Telegram chat/user id
  pairing_code  TEXT,                      -- Einmal-Code aus dem Dashboard
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, chat_id)
);

CREATE INDEX IF NOT EXISTS bernd_channel_links_user_idx ON bernd_channel_links (user_id);
CREATE INDEX IF NOT EXISTS bernd_channel_links_project_idx ON bernd_channel_links (project_id);

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE bernd_channel_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bernd_channel_links_own" ON bernd_channel_links;
CREATE POLICY "bernd_channel_links_own" ON bernd_channel_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── bernd_messages ────────────────────────────────────────────────────────
-- Dauerhafter Router-Konversations-State/Audit (getrennt vom Coach-`messages`).
-- Kein user_id-Ownership-Check nötig (Service-Client-only, kein direkter User-Zugriff über
-- Cookie-Client) — RLS trotzdem über Projekt-Ownership analog rls_project_scoping.
CREATE TABLE IF NOT EXISTS bernd_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chat_id     TEXT NOT NULL,
  direction   TEXT NOT NULL,               -- in | out
  role        TEXT NOT NULL,               -- user | assistant | tool
  content     TEXT,
  media_kind  TEXT,                        -- text | voice | photo
  meta        JSONB NOT NULL DEFAULT '{}', -- { transcript, ocr, intent, flow_slug, exec_id }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bernd_messages_chat_idx
  ON bernd_messages (project_id, chat_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────
-- bernd_messages trägt kein user_id (project_id ist die einzige Fremdreferenz) — Ownership
-- wird über den zugehörigen Projekt-Owner geprüft, exakt im Stil von rls_project_scoping.
ALTER TABLE bernd_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bernd_messages_own" ON bernd_messages;
CREATE POLICY "bernd_messages_own" ON bernd_messages
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
