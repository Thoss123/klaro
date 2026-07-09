---
type: template_workflow
use_cases: [lead-follow-up-automatisieren, angebot-nachfassen]
tools_required: [gmail]
n8n_json_file: followup-serie.json
---

# Lead-Follow-up-Serie (T3 / T7 / T14)

## Beschreibung
Fasst offene Angebote automatisch **dreistufig** nach: 3 Tage, 7 Tage, 14 Tage nach
`offer_sent_at` — jede Stufe individuell formuliert (nicht die gleiche Mail dreimal). Läuft
als **EINE tägliche Serie über Schedule + Zustand**, NICHT über parallele Wait-Nodes (kein
Wait-Node-Wildwuchs pro Lead, ein Trigger reicht für beliebig viele Leads gleichzeitig).

Ersetzt das ältere Konzept einer einzelnen T+3-Follow-up-Mail (`lead-followup.md`) durch eine
vollständige Serie mit sich merkendem Zustand.

## Architektur (wichtig)
Alle KI-Schritte laufen über `POST {{APP_BASE_URL}}/api/agent/llm` (prompt_key
`followup/draft_stage`, siehe `lib/agent-prompts.ts`) — kein eigener Mistral-Node, Credit-
Abrechnung wie im Chat. Der Zustand (welcher Lead ist bei welcher Stage, wann kam das
Angebot) liegt in der Axantilo-**Datenablage** (`knowledge/templates/bausteine/datenablage-api.md`),
NICHT in Google Sheets — kein Setup für den Nutzer nötig.

## Kette
Täglich (Schedule) → Datenablage: Leads lesen (`op=select`, ganze Tabelle) → Fällige Stage
berechnen (Code: pro Lead T3/T7/T14 aus `offer_sent_at` + `followup_stage` ableiten, fällige
und noch nicht gesendete Stages rausfiltern) → KI: Nachfass-Entwurf (`followup/draft_stage`)
→ Nachfass-Mail senden (Mail-Provider-Slot) → Datenablage: Stage aktualisieren (`op=update`,
setzt `followup_stage`/`status`; nach Stage 3 automatisch `status: 'done'`).

Läuft pro Ausführung über beliebig viele fällige Leads gleichzeitig (jedes Item durchläuft die
Kette unabhängig) — kein Parallel-Wait pro Lead, keine Race Conditions durch mehrfaches
Senden derselben Stage (Duplikat-Schutz über `followup_stage` in der Datenablage).

## Stages
| Stage | Tag | Ton |
|---|---|---|
| 1 | T3 | freundliche, unaufdringliche Nachfrage |
| 2 | T7 | zweite Erinnerung, etwas konkreter (z.B. Termin anbieten) |
| 3 | T14 | letzte Erinnerung mit Ausstiegsoption; danach `status: 'done'` |

## Datenablage-Zeile (Tabelle `{{FOLLOWUP_TABLE}}`, Default `followup_leads`)
Erwartete Felder in `data`:
- `offer_sent_at` (ISO-Datum, Pflicht — ohne das kein Lead fällig)
- `followup_stage` (0/1/2, wird vom Workflow hochgezählt)
- `status` (`offen`/`done`)
- `email` bzw. `send_target` (Empfänger der Nachfass-Mail)
- `lead_kontext` (Angebot/Ansprechpartner/Eckdaten, frei formuliert)
- `bisherige_mails` (bisherige Korrespondenz in diesem Vorgang, für den Prompt)

Zeilen werden i.d.R. von einem vorgelagerten Angebots-Workflow (`offer/draft`) angelegt,
sobald ein Angebot rausgeht.

## Slots
- `{{SEND_NODE}}` — Mail-Provider (gmail/outlook/imap), Struct-Slot wie in email-triage-draft
- `{{APP_BASE_URL}}` — Axantilo-App (z.B. `https://www.axantilo.com`)
- `{{PROJECT_ID}}` — Projekt/Workspace des Nutzers
- `{{PERSONA_PATH}}` — z.B. `rules/persona_thomas.md`
- `{{FOLLOWUP_TABLE}}` — logischer Tabellenname in der Datenablage (Default `followup_leads`)

## Voraussetzungen
- Mail-Provider verbunden (Gmail = zentrale 3-Klick-OAuth)
- HTTP-Header-Auth-Credential `Authorization: Bearer <WORKSPACE_API_TOKEN>` an allen App-HTTP-Nodes
- Workspace-Regeln existieren (`ensureBaseRules` legt company_base beim Onboarding an)

## Nach dem Deployment
- Credentials prüfen, Testlauf mit gepinntem Trigger (Datenablage-Antwort im Test mit 1-2
  Beispiel-Leads pinnen, NIE Credential-/Send-Nodes), dann aktivieren.
- Sicherstellen, dass Leads mit `offer_sent_at` in die Datenablage geschrieben werden (z.B.
  vom Angebots-Autopilot).
