-- Bernd v2-Onboarding: lebendes Profil während des Setup-Chats.
-- Hält den kompletten Setup-Fortschritt (Profil, Scope-Auswahl, Ablauf-Antworten, Ziele,
-- Regeln, Einschätzung, Fortschritts-Prozente, Wissen-Referenzen) getrennt von den
-- operativen `bernd_configs`-Feldern (gewerk/preislogik/active_templates/...), die erst beim
-- "Bernd einstellen"-Deployment aus `setup_state` abgeleitet werden (siehe WP5).
-- Idempotent wie bestehende Migrationen (ADD COLUMN IF NOT EXISTS), keine neuen Policies
-- nötig — die Spalte erbt die Tabellen-RLS von `bernd_configs` (20260710000000_bernd_core.sql).

ALTER TABLE bernd_configs
  ADD COLUMN IF NOT EXISTS setup_state JSONB NOT NULL DEFAULT '{}';
