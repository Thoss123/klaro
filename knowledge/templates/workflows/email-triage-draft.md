---
type: template_workflow
use_cases: [eingehende-mails-beantworten, anfragen-automatisieren]
tools_required: [gmail, twilio]
n8n_json_file: email-triage-draft.json
---

# E-Mail Triage & Entwurf (mit WhatsApp-Freigabe)

## Beschreibung
Bei jeder eingehenden E-Mail lädt der Workflow das firmen- und personenspezifische Wissen aus
dem Axantilo-Workspace (`company_base.md` + `persona_<name>.md`), schreibt einen fertigen
Antwort-Entwurf und schickt ihn dem Verantwortlichen per WhatsApp zur Freigabe. Gesendet wird
erst nach „SENDEN" — der Inbound-Flow (`whatsapp-control`) übernimmt das Absenden bzw. die
Revisions-Schleife. Der Entwurf wird als `agent_pending_actions`-Eintrag abgelegt.

## Kette
Neue E-Mail → Firmenwissen laden → Persona laden → System-Prompt bauen → AI-Agent (Entwurf)
→ Freigabe anlegen (POST /api/agent/pending) → WhatsApp senden

## Slots
- `{{TRIGGER_NODE}}` — Mail-Provider-Trigger (gmail/outlook/imap) via `lib/template-loader.ts`
- `{{APP_BASE_URL}}` — Basis-URL der Axantilo-App (z.B. `https://app.axantilo.com`)
- `{{PROJECT_ID}}` — Projekt-/Workspace-ID
- `{{PERSONA_PATH}}` — z.B. `rules/persona_thomas.md`
- `{{OWNER_WHATSAPP}}` — WhatsApp-Nummer des Freigebers (`+49…`)

## Voraussetzungen
- Mail-Provider verbunden (Gmail = 3-Klick-OAuth)
- HTTP-Header-Auth-Credential in n8n mit `Authorization: Bearer <WORKSPACE_API_TOKEN>`
- Twilio zentral (Axantilo) — keine Nutzer-Einrichtung
- Ein Chat Model als Sub-Node am Agent (hier Mistral)

## Bausteine
Nutzt [rules-loader](../bausteine/rules-loader.md) (Wissen laden) und ist das Gegenstück zur
Learning Engine (Flow 2), die `rules/*` fortschreibt. WhatsApp-Freigabe/Revision übernimmt der
separate Inbound-Flow über `agent_pending_actions`.

## Nach dem Deployment
- Provider-OAuth + Header-Auth-Credential in n8n bestätigen.
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{OWNER_WHATSAPP}}`, `{{PERSONA_PATH}}` setzen.
- Testlauf mit gepinntem Trigger (nur Trigger pinnen), dann aktivieren.
