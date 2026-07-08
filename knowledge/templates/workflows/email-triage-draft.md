---
type: template_workflow
use_cases: [eingehende-mails-beantworten, anfragen-automatisieren]
tools_required: [gmail, twilio]
n8n_json_file: email-triage-draft.json
---

# E-Mail-Automation: Triage & Antwort-Entwurf

## Beschreibung
Bei jeder eingehenden E-Mail: in eine von **8 Kategorien** einordnen und einen **spezifischen Weg** fahren:

| Kategorie | Weg |
|---|---|
| `lead_inquiry` | Antwort-Entwurf (Preise/Leistungen, Einladung) → Freigabe |
| `scheduling` | **Kalender lesen** (Google Calendar, nächste 7 Tage) → Entwurf mit 2-3 konkreten freien Fenstern → Freigabe. Kalender-Node ist disabled ausgeliefert; ohne Verbindung fragt der Entwurf nach Wunschterminen |
| `support_faq` | Antwort-Entwurf — **inkl. Storno/Kündigung und Fragen von Kunden zu IHRER Rechnung** → Freigabe |
| `vendor_billing` | NUR eingehende Buchhaltung (Lieferanten-Rechnungen, Abo-Abbuchungen): KI-Kurzinfo (Anbieter, Betrag, Fälligkeit) per Steuerkanal — kein Entwurf, Mail bleibt im Postfach |
| `system_alerts` | Security-/Login-/2FA-/Server-Mails von Tools: nur bei `urgency: high` ein Push, sonst still ignoriert |
| `newsletters` | Als gelesen markieren + archivieren (Postfach bleibt sauber, kein Token verbrannt) |
| `spam_marketing` | Als gelesen markieren + archivieren |
| `other` | Zurückhaltender Entwurf → Freigabe |

Die kritische Abgrenzung steckt im Classifier-Prompt: „Wo bleibt MEINE Rechnung?" (Kunde) →
`support_faq` mit Antwort-Entwurf; „Ihre Rechnung von Hetzner" (Lieferant) → `vendor_billing`
mit Kurzinfo. Automatisierte Tool-Mails (die gern 100/Woche senden) verbrennen keine
Drafting-Token mehr.

**Funktioniert mit jedem Mail-Anbieter**: Gmail / Outlook / IMAP über die Provider-Slots
(`{{TRIGGER_NODE}}`/`{{SEND_NODE}}`, aufgelöst durch `lib/template-loader.ts`).

## Architektur (wichtig)
Alle KI-Schritte laufen über `POST {{APP_BASE_URL}}/api/agent/llm` — NICHT über eigene
Mistral-Nodes. Vorteile: Axantilos zentraler Mistral-Key (Nutzer hinterlegt nichts),
Credit-Abrechnung pro Aufruf wie im Chat, und die Prompts sind Standard-Prompts
(`lib/agent-prompts.ts`), die der Nutzer per Coach-Tool `update_agent_prompt` anpassen kann.
Jede Kategorie hat ihren eigenen System-Prompt (email/draft_lead_inquiry, …_scheduling,
…_support_faq, …_other); Firmenwissen + Persona werden serverseitig injiziert.

## Kette
Neue E-Mail → KI: Kategorisieren (email/classify) → Kategorie parsen → Switch (6 Zweige)
→ KI: Entwurf schreiben (prompt_key je Kategorie) → Freigabe anlegen (POST /api/agent/pending)
→ Benachrichtigung (WhatsApp via Twilio)

## Human-in-the-Loop (Freigabe-Kanal)
Der Entwurf wird als `agent_pending_actions`-Eintrag gespeichert. Die Benachrichtigung/Freigabe
läuft standardmäßig hier über WhatsApp — der **Steuerkanal ist aber eine EIGENE Funktionalität**
(siehe whatsapp-control.md) und austauschbar: statt Twilio-Node z.B. Slack/Teams-Node oder
„Entwurf im Postfach ablegen" (Gmail draft:create). Die E-Mail-Automation funktioniert
unabhängig davon, welcher Kanal die Freigabe übernimmt.

## Slots
- `{{TRIGGER_NODE}}` / `{{SEND_NODE}}` — Mail-Provider (gmail/outlook/imap)
- `{{APP_BASE_URL}}` — Axantilo-App (z.B. `https://www.axantilo.com`)
- `{{PROJECT_ID}}` — Projekt/Workspace des Nutzers
- `{{PERSONA_PATH}}` — z.B. `rules/persona_thomas.md`
- `{{OWNER_WHATSAPP}}` — Nummer des Freigebers, nackt (`+43…`); Twilio-Node präfixt selbst
- `{{TWILIO_WHATSAPP_FROM}}` — WhatsApp-Sender (Sandbox: `+14155238886`)

## Voraussetzungen
- Mail-Provider verbunden (Gmail = zentrale 3-Klick-OAuth)
- HTTP-Header-Auth-Credential `Authorization: Bearer <WORKSPACE_API_TOKEN>` an allen App-HTTP-Nodes
- Twilio zentral (Axantilo) — kein Nutzer-Setup
- Workspace-Regeln existieren (`ensureBaseRules` legt company_base beim Onboarding an)

## Nach dem Deployment
- Credentials prüfen, Testlauf mit gepinntem Trigger, dann aktivieren.
- Gegenstücke aktivieren: whatsapp-control (Freigabe/Revision) + email-learning-engine (Lernen).
