---
type: template_workflow
use_cases: [rechnung-mahnwesen-automatisieren]
tools_required: [gmail, google_docs, google_drive]
n8n_json_file: rechnung-mahnwesen.json
---

# Rechnung & Mahnwesen

## Beschreibung
Zwei zusammengehörige Abläufe in **einer** Workflow-JSON:
- **Flow A — Rechnung erstellen:** Ein erledigter Auftrag (Webhook/Formular) wird automatisch
  zu einer Rechnung — Positionen per KI aus den Auftragsdaten formatiert, in eine Google-Docs-
  Vorlage eingesetzt, als PDF exportiert, per Mail an den Kunden geschickt und in der
  Datenablage vermerkt (Betrag, Fälligkeit, Status `sent`).
- **Flow B — Mahnlauf:** Ein täglicher Schedule liest offene Rechnungen aus der Datenablage,
  berechnet pro überfälliger Rechnung die fällige Mahnstufe (0→1 ab Fälligkeit, →2 nach 7,
  →3 nach 14 Tagen), formuliert eine eskalierende Zahlungserinnerung und aktualisiert den
  Stand — **über Schedule + Zustand, nie parallele Wait-Nodes** (wie followup-serie).

## Architektur (wichtig)
KI-Schritte (`invoice/draft`, `invoice/reminder`) laufen über `POST {{APP_BASE_URL}}/api/agent/llm`
(prompt_keys in `lib/agent-prompts.ts`) — kein eigener Mistral-Node, Credit-Abrechnung wie im
Chat. Der Rechnungs-/Mahn-Zustand liegt in der Axantilo-**Datenablage**
(`knowledge/templates/bausteine/datenablage-api.md`), nicht in Google Sheets. Die PDF-Erzeugung
nutzt die **Google-Docs-Vorlage des Nutzers** (per 3-Klick-OAuth verbundenes Konto): Drive
kopiert die Vorlage, Docs ersetzt die Platzhalter, Drive exportiert als PDF.

## Kette
**Flow A:** Auftrag erledigt (Webhook) → Rechnungsdaten sammeln (Code) → KI: Rechnungstext
formatieren (`invoice/draft`) → Rechnungstext parsen (Code, Rechnungsnummer/Fälligkeit) →
Rechnung aus Vorlage kopieren (Drive `copy`) → Rechnung befüllen (Docs `update`/replaceAll) →
Rechnung als PDF exportieren (Drive `download` + docsToFormat=application/pdf) → Rechnung senden
(Mail-Provider-Slot, PDF-Anhang) → Rechnung in Datenablage speichern (`op=insert`).

**Flow B:** Täglicher Mahnlauf (Schedule) → Offene Rechnungen lesen (`op=select`) → Mahnstufe
berechnen (Code, nur fällige neue Stufe, nie doppelt) → KI: Zahlungserinnerung
(`invoice/reminder`) → Mahnung senden (Mail-Provider-Slot) → Mahnstufe aktualisieren (`op=update`).

## Datenablage-Zeile (Tabelle `{{INVOICE_TABLE}}`, Default `rechnungen`)
Felder in `data`: `rechnungsnummer`, `customer`, `email`, `amount`, `due_date` (ISO),
`status` (`sent`/`gemahnt`/`paid`), `mahnstufe` (0-3), `sent_at`, `last_reminded_at`.
Als `paid`/`bezahlt` markierte Zeilen werden im Mahnlauf übersprungen.

## Slots
- `{{SEND_NODE}}` — Mail-Provider (gmail/outlook/imap), Struct-Slot (beide Send-Nodes)
- `{{APP_BASE_URL}}` / `{{PROJECT_ID}}` / `{{PERSONA_PATH}}`
- `{{INVOICE_TABLE}}` — logischer Tabellenname (Default `rechnungen`)
- `{{INVOICE_DOC_TEMPLATE_ID}}` — Google-Docs-Datei-ID der Rechnungsvorlage des Nutzers
  (aus der Docs-URL); Vorlage siehe `knowledge/templates/documents/rechnung-vorlage.md`
- `{{ORDER_DONE_WEBHOOK_PATH}}` — kollisionsfreier Webhook-Pfad (`auftrag-fertig-<suffix>`)

## Voraussetzungen
- Mail-Provider verbunden (Gmail = zentrale 3-Klick-OAuth)
- **Google Docs + Google Drive verbunden** (dieselbe 3-Klick-OAuth) — Pflicht, da die
  Rechnungs-Vorlage kopiert/befüllt/als PDF exportiert wird. `deployTemplateWorkflow` bindet
  die Credentials automatisch per tool_name (`google_docs`/`google_drive`), aktiviert wird der
  Workflow erst, wenn die Zugänge verbunden sind.
- HTTP-Header-Auth-Credential (`Authorization: Bearer <WORKSPACE_API_TOKEN>`) an allen App-HTTP-Nodes
- Eine Rechnungs-Vorlage als Google Doc mit den Platzhaltern `{{rechnungsnummer}}`, `{{datum}}`,
  `{{kundenname}}`, `{{leistung}}`, `{{positionen}}`, `{{betrag}}`, `{{faelligkeit}}`

## Nach dem Deployment
- Credentials prüfen, Testlauf mit gepinntem Trigger (Beispiel-Auftrag als Webhook-Payload
  bzw. Beispiel-Rechnungen als Datenablage-Antwort pinnen, NIE Credential-/Send-/Docs-Nodes),
  dann aktivieren.
- Für den Mahnlauf sicherstellen, dass Rechnungen mit `due_date` in die Datenablage geschrieben
  werden (macht Flow A automatisch).
