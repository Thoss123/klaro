---
type: template_workflow
use_cases: [lead-qualifizierung, bewertungs-antwort, social-media-post, ki-webhook]
tools_required: []
n8n_json_file: ai-webhook.json
---

# AI-Webhook (generische KI-Funktionalität)

## Beschreibung
Ein wiederverwendbares Muster für sofort laufende KI-Funktionalitäten: Webhook nimmt Text
entgegen (`{ "text": "..." }`), die KI (Mistral über Axantilo, Credit-Abzug) verarbeitet ihn
gemäß dem hinterlegten Prompt und gibt das Ergebnis zurück (`{ "result": "..." }`). Braucht
KEIN Postfach, kein OAuth — läuft sofort, nur mit dem Workspace-Token.

Jede Funktionalität = **derselbe Workflow + ein anderer Prompt** (Slot `{{PROMPT_KEY}}`). Neue
Funktionalität hinzufügen = neuer Prompt in `lib/agent-prompts.ts` + Eintrag in
`AI_TOOL_FUNCTIONS` (`lib/deploy-agent-workflow.ts`), kein neues Workflow-JSON.

## Aktuelle Funktionalitäten (Coach-Tool `setup_ai_tool`)
- `lead_qualify` — Anfrage vorqualifizieren (heiß/warm/kalt + nächster Schritt), JSON
- `review_response` — öffentliche Antwort auf eine Kundenbewertung
- `social_post` — Social-Media-Post erstellen

## Slots
- `{{FN_WEBHOOK_PATH}}` — eindeutiger Webhook-Pfad, `{{PROMPT_KEY}}` — welcher Agenten-Prompt
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{PERSONA_PATH}}`

## Nutzung
`POST {n8n}/webhook/{{FN_WEBHOOK_PATH}}` mit `{ "text": "..." }` → `{ "result": "..." }`.
