-- Agent Pending Actions: Zustand für den WhatsApp-Steuerkanal (Human-in-the-Loop)
-- Bridge zwischen zwei n8n-Executions: Flow 1 legt einen Entwurf als `pending` an und
-- schickt ihn per WhatsApp; der Inbound-Flow schlägt die pending Action für die Nummer nach
-- und sendet ihn frei ('senden') ODER überarbeitet ihn (Revisions-Schleife). So kein fragiler
-- Dauer-Wait in n8n, und der exakte Entwurf bleibt strukturiert erhalten.

CREATE TABLE IF NOT EXISTS agent_pending_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  contact     TEXT NOT NULL,                      -- Telefonnummer des freigebenden Users (whatsapp:+49…)
  kind        TEXT NOT NULL DEFAULT 'draft_approval',
  payload     JSONB NOT NULL DEFAULT '{}',        -- {original_email, draft, provider, send_target, persona}
  status      TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | sent | cancelled
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schneller Lookup: „gibt es eine offene Freigabe für diese Nummer in diesem Projekt?"
CREATE INDEX IF NOT EXISTS agent_pending_contact_idx
  ON agent_pending_actions (project_id, contact, status);
CREATE INDEX IF NOT EXISTS agent_pending_user_idx ON agent_pending_actions (user_id);

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE agent_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_pending_actions_own" ON agent_pending_actions;
CREATE POLICY "agent_pending_actions_own" ON agent_pending_actions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
