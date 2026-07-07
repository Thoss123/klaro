---
type: template_workflow
use_cases: [automation-lernt-mit, regeln-aus-feedback]
tools_required: []
n8n_json_file: email-learning-engine.json
---

# Learning Engine: Regeln aus Entwurf vs. finaler Version lernen

## Beschreibung
Macht die E-Mail-Automation selbstlernend: Nach jedem Versand vergleicht ein Guardrail-Agent
den ersten AI-Entwurf mit der final gesendeten Version und dem Feedback-Verlauf des Inhabers.
Daraus leitet er **permanente Regeln** ab und schreibt die Workspace-Dateien konsolidiert neu:
- Firmen-Fakten (Preise, Zeiten, Angebote) → `rules/company_base.md`
- Stil/Tonfall/Signatur → `rules/persona_<name>.md`

Guardrails gegen „Rule Bloat": einmalige Ausnahmen werden ignoriert, Konflikte ersetzen die
alte Regel (kein Append, keine Duplikate). Die Dateien werden KOMPLETT neu geschrieben.

## Kette
Lern-Auftrag (Webhook) → KI: Regeln ableiten (email/learn, JSON) → Regeln parsen
→ Firmenwissen ändern? → PUT /api/workspace (company) · Persona ändern? → PUT /api/workspace (persona)

## Aufruf (von anderen Flows)
`POST https://<n8n-host>/webhook/{{LEARNING_WEBHOOK_PATH}}` mit:
```json
{
  "project_id": "…",
  "persona": "rules/persona_thomas.md",
  "first_draft": "<erster AI-Entwurf>",
  "final_text": "<final gesendete Version>",
  "feedback_log": ["Feedback 1", "Feedback 2"]
}
```
Wird vom Steuerkanal (whatsapp-control) nach jeder Freigabe automatisch aufgerufen —
funktioniert aber mit jeder Quelle (z.B. später: Gmail-Trigger auf gesendete Entwürfe).

## Slots
- `{{APP_BASE_URL}}` — Axantilo-App
- `{{LEARNING_WEBHOOK_PATH}}` — Webhook-Pfad dieses Flows

## Verifiziert (E2E-Test)
Feedback „Probetraining ist immer kostenlos + Signatur Sportliche Grüße" →
company_base um den Fakt ergänzt, persona-Signatur ERSETZT (nicht dupliziert), Version +1.
