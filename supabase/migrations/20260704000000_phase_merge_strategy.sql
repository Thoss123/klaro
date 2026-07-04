-- Phasen-Merge (analyse+plan → analyse) + Strategie-Datei + Firmen-Website.
--
-- 1) sessions.firmen_website: optionales Onboarding-Feld für die Firmen-Recherche.
-- 2) projects.strategy: interne Gesprächsstrategie des Coaches (Markdown),
--    projektweit (jede Phase ist eine eigene Session-Zeile — Session-Ebene wäre falsch).
-- 3) Legacy-Sessions der entfallenen Phase 'plan' laufen als 'analyse' weiter
--    (die gemergte Phase 2 deckt den Plan-Teil ab).

alter table sessions add column if not exists firmen_website text;
-- technik_level wurde im Wizard erhoben, aber nie persistiert — jetzt Spalte + Insert.
alter table sessions add column if not exists technik_level text;

alter table projects add column if not exists strategy text;
alter table projects add column if not exists strategy_updated_at timestamptz;

update sessions set phase = 'analyse' where phase = 'plan';
