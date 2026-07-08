---
type: template_workflow
use_cases: [whatsapp-steuerkanal, freigabe-per-chat, chef-assistent]
tools_required: [twilio, gmail]
n8n_json_file: whatsapp-control.json
---

# Steuerkanal: WhatsApp-Chatbot für den Inhaber (Freigabe, Revision, Assistent)

## Beschreibung
**Eigenständige Funktionalität** (unabhängig von der E-Mail-Automation, wird aber gern mit ihr
kombiniert und sollte Nutzern der E-Mail-Automation zusätzlich vorgeschlagen werden):
Ein bidirektionaler Chat-Kanal, über den der Inhaber seine Automationen steuert und Fragen stellt.

Drei Routen pro eingehender Nachricht:
1. **Freigabe** — es gibt einen offenen Entwurf und die Nachricht ist „SENDEN/ok/passt" →
   E-Mail wird an den Kunden gesendet, Freigabe abgeschlossen, Learning Engine angestoßen.
2. **Revision** — es gibt einen offenen Entwurf und die Nachricht ist Feedback („mach förmlicher",
   „erwähne noch X") → KI überarbeitet den Entwurf (email/revise), speichert ihn, schickt die
   neue Version zurück. Beliebig oft wiederholbar (Feedback-Verlauf wird mitgeführt).
3. **Ad-hoc-Assistent (tool-fähig)** — kein offener Entwurf → freie Frage geht an
   `POST /api/agent/assistant`. Dieser Endpunkt führt eine **server-seitige
   Function-Calling-Schleife** (Mistral) aus: er beantwortet Firmen-Fragen direkt aus dem
   Wissen ODER ruft Werkzeuge, wenn aktuelle Daten nötig sind:
   - `list_pending_drafts` — „was wartet auf Freigabe?" (eigene DB, funktioniert sofort)
   - `get_calendar` — „wann habe ich Zeit?" (n8n-Tool-Webhook `ASSISTANT_CALENDAR_WEBHOOK_URL`)
   - `crm_lookup` — „welche Leads sind offen?" (n8n-Tool-Webhook `ASSISTANT_CRM_WEBHOOK_URL`)
   Kalender/CRM melden sauber „nicht verbunden", solange kein Webhook gesetzt ist.
   **Warum server-seitig statt nativem n8n-Agent-Node:** so bleibt der Mistral-Key server-only
   und die Token ALLER Tool-Runden werden zuverlässig als Credits abgezogen (native Agent-Nodes
   verlieren die Usage bei Mehrfach-Tool-Aufrufen).

Derselbe Aufbau funktioniert für **Slack/Teams**: Webhook-Trigger + Sende-Node tauschen,
Rest (pending-Lookup, Routen, LLM-Aufrufe) bleibt identisch.

## Architektur
Zustand liegt in `agent_pending_actions` (App-DB) — die Brücke zwischen der Automation, die
einen Entwurf anlegt, und diesem Inbound-Flow. KI-Aufrufe über `POST /api/agent/llm`
(zentraler Mistral-Key, Credit-Abrechnung, Prompts per Coach anpassbar).

## Kette
WhatsApp eingehend (Webhook, Twilio-Format `Body`/`From`) → Nachricht lesen → Offene Freigabe
suchen (GET /api/agent/pending) → Route bestimmen → Route-Switch →
  send:   E-Mail senden ({{SEND_NODE}}) → Freigabe abschließen → Lernen anstoßen → „✅ Gesendet"
  revise: KI: Entwurf überarbeiten → Freigabe aktualisieren (draft + feedback_log) → neuer Entwurf per WhatsApp
  adhoc:  KI: Assistent → Antwort per WhatsApp

## Slots
- `{{SEND_NODE}}` — Mail-Provider fürs Senden (gmail/outlook/imap)
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{PERSONA_PATH}}`
- `{{OWNER_WHATSAPP}}` (nackte Nummer), `{{TWILIO_WHATSAPP_FROM}}` (Sandbox: `+14155238886`)
- `{{CONTROL_WEBHOOK_PATH}}` — Webhook-Pfad dieses Flows
- `{{LEARNING_WEBHOOK_URL}}` — Webhook der Learning Engine

## Einrichtung (einmalig)
1. Workflow aktivieren → Webhook-URL: `https://<n8n-host>/webhook/{{CONTROL_WEBHOOK_PATH}}`
2. Twilio Console → Messaging → WhatsApp Sandbox → „When a message comes in" = diese URL.
3. Inhaber joint der Sandbox (einmalige `join <code>`-Nachricht an die Sandbox-Nummer).
4. Produktion: eigener WhatsApp-Sender (Meta-Verifizierung) → `{{TWILIO_WHATSAPP_FROM}}` ersetzen.

## Stolperfallen (getestet)
- Twilio-Node: `to`/`from` OHNE `whatsapp:`-Präfix — `toWhatsapp: true` präfixt selbst (sonst Error 21211).
- `from` muss ein WhatsApp-Channel sein (Sandbox-Nummer), nicht die eigene SMS-Nummer (sonst Error 63007).
- `contact` in pending-Actions = Twilio-`From`-Format (`whatsapp:+43…`) für den Lookup.
