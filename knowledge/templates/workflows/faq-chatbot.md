---
type: template_workflow
use_cases: [faq-chatbot, website-chatbot, kundenfragen-beantworten]
tools_required: []
n8n_json_file: faq-chatbot.json
---

# FAQ-Chatbot (Website / WhatsApp / Slack)

## Beschreibung
Ein Chatbot, der Kundenfragen aus dem Firmenwissen + Persona beantwortet — sofort, ohne Postfach
oder OAuth. Ein Webhook nimmt eine Frage entgegen (`{ "question": "..." }`), die KI (Mistral über
Axantilo, mit Credit-Abzug) antwortet im Stil des Betriebs, die Antwort geht direkt zurück
(`{ "answer": "..." }`). Damit lässt sich ein Website-Widget, ein WhatsApp-Bot oder ein Slack-Bot
backen — man schickt die Nutzerfrage an den Webhook und zeigt die Antwort an.

**Eigenständig + sofort lauffähig:** braucht KEIN verbundenes Postfach, kein Google-OAuth — nur den
Workspace-Token. Live-verifiziert (Frage „Was kostet die Erstberatung?" → „90 EUR").

## Slots
- `{{FAQ_WEBHOOK_PATH}}` — eindeutiger Webhook-Pfad pro Projekt (z.B. `faq-<proj8>`)
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{PERSONA_PATH}}`

## Voraussetzungen
- HTTP-Header-Auth-Credential mit `Authorization: Bearer <WORKSPACE_API_TOKEN>` (zentral)
- Firmenwissen im Workspace (`rules/company_base.md`) — je voller, desto besser die Antworten

## Nutzung
`POST {n8n}/webhook/{{FAQ_WEBHOOK_PATH}}` mit `{ "question": "..." }` → `{ "answer": "..." }`.
Verhalten per `update_agent_prompt` (prompt_key `control/adhoc`) anpassbar.
