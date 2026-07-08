---
type: template_workflow
use_cases: [eingehende-mails-beantworten, anfragen-automatisieren]
tools_required: [gmail]
n8n_json_file: email-autopilot.json
---

# E-Mail Autopilot (Postfach-Entwurf) — eigenständig, ohne Steuerkanal

## Beschreibung
Die **eigenständige** E-Mail-Automation: braucht KEINEN Steuerkanal (kein WhatsApp/Discord/
Twilio, keine Unternehmensverifizierung) — nur das verbundene Postfach. Jede eingehende Mail
wird in 8 Kategorien sortiert; für die beantwortbaren (Lead, Termin, Support/Storno, Sonstiges)
schreibt die KI einen Antwort-Entwurf und legt ihn **direkt als Entwurf ins Postfach des Users**
(Gmail-Draft, an den Original-Thread gehängt). Der User sieht den Entwurf in seinem Postfach,
prüft ihn und sendet selbst — das ist der Human-in-the-Loop, ganz ohne externen Kanal.

Newsletter/Spam werden als gelesen markiert + archiviert; Lieferantenrechnungen und System-Alerts
bleiben unangetastet im Postfach (kein Entwurf, keine Störung).

## Verhältnis zum Steuerkanal
Diese Automation ist **unabhängig** vom WhatsApp/Discord/Slack/Teams-Steuerkanal. Der Steuerkanal
ist eine **separate, zusätzliche** Funktionalität (Remote-Freigabe/Revision + Ad-hoc-Assistent),
die man oben drauf setzen kann — aber nicht muss. Der Autopilot funktioniert alleine.

## Slots
- `{{TRIGGER_NODE}}` / `{{SEND_NODE}}` — Mail-Provider (Draft-Modus aktuell Gmail-erprobt)
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{PERSONA_PATH}}`

## Voraussetzungen
- Postfach verbunden (Gmail 3-Klick-OAuth)
- HTTP-Header-Auth-Credential mit `Authorization: Bearer <WORKSPACE_API_TOKEN>`
- Optional: Google Calendar verbunden (Termin-Route schlägt dann echte freie Slots vor)

## Nach dem Deployment
Postfach-OAuth bestätigen, aktivieren. Entwürfe erscheinen im Entwürfe-Ordner des Postfachs.
