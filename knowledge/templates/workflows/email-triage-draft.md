---
type: template_workflow
use_cases: [eingehende-mails-beantworten, anfragen-automatisieren]
tools_required: [gmail, telegram]
n8n_json_file: email-triage-draft.json
---

# E-Mail-Automation: Triage & Antwort-Entwurf

## Beschreibung

Der Flow sortiert jede neue E-Mail in acht Kategorien und führt den passenden Weg aus:

- Kundenanfragen, Terminwünsche, Supportfragen und sonstige Mails erhalten einen Entwurf.
- Lieferantenrechnungen werden zusammengefasst und als Telegram-Hinweis gemeldet.
- Dringende Systemmeldungen werden per Telegram weitergegeben.
- Newsletter und Spam werden gelesen markiert und archiviert.

Alle KI-Schritte laufen über `POST {{APP_BASE_URL}}/api/agent/llm`. Firmenwissen und Persona
werden serverseitig aus dem Projekt geladen; eigene KI-Credentials im Workflow sind nicht nötig.

## Freigabe und Versand

Entwürfe gehen über `POST /api/bernd/hitl-request` an Telegram und werden gleichzeitig als
offene Freigabe gespeichert. Die erste Antwort in Telegram oder im Dashboard gewinnt atomar:

- `ja` ruft den projektbezogenen Versand-Webhook auf und beantwortet die Originalmail.
- Freitext-Feedback überarbeitet den Entwurf, schließt die alte Freigabe und stellt die neue
  Version erneut zur Freigabe.
- `nein` verwirft die offene Freigabe ohne Versand.

Reine Hinweise ohne Freigabe laufen über `POST /api/bernd/notify`.

## Slots

- `{{TRIGGER_NODE}}` / `{{SEND_NODE}}`: Mail-Provider
- `{{APP_BASE_URL}}`: aktuelle Axantilo-Origin
- `{{PROJECT_ID}}`: Projekt des Betriebs
- `{{PERSONA_PATH}}`: Persona-Regeldatei des Betriebs
- `{{EMAIL_SEND_WEBHOOK_PATH}}`: eindeutiger Versand-Webhook je Projekt

## Voraussetzungen

- Gmail ist per OAuth verbunden.
- Telegram ist mit dem Projekt gekoppelt.
- Das zentrale HTTP-Header-Credential für `WORKSPACE_API_TOKEN` ist an den App-HTTP-Nodes gebunden.
- Workspace-Regeln wurden im Onboarding angelegt.

## Test und Aktivierung

Der Referenz-Flow wird mit Pin-Daten für Triage, Freigabe-Versand und Revision getestet. Beim
Deployment bindet Axantilo die Nutzer-Credentials und ersetzt alle Slots. Erst danach wird die
projektbezogene Kopie aktiviert.
