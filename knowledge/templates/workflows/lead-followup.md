---
type: template_workflow
use_cases: [webdesign-angebot-aus-gespraech]
tools_required: [gmail, google-sheets]
n8n_json_file: lead-followup.json
---

# Lead-Follow-up nach 3 Tagen

## Beschreibung
Prüft täglich eine Lead-Tabelle und sendet ein freundliches Follow-up an alle Anfragen, die seit 3 Tagen ohne Antwort sind und noch nicht angeschrieben wurden.

## Voraussetzungen
- Gmail verbunden
- Google Sheets mit Spalten: email, status, angefragt_am, followup_gesendet

## Variablen
- {{SHEET_ID}}: ID der Lead-Tabelle
- {{ABSENDER_NAME}}: dein Name für die Signatur

## n8n Workflow JSON
```json
{
  "name": "Lead Follow-up 3 Tage",
  "nodes": [
    {
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "name": "Täglich 9 Uhr",
      "parameters": { "rule": { "interval": [{ "field": "hours", "triggerAtHour": 9 }] } }
    },
    {
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "name": "Leads lesen",
      "parameters": { "operation": "read", "documentId": "{{SHEET_ID}}" }
    },
    {
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2.1,
      "name": "Follow-up senden",
      "parameters": {
        "resource": "message",
        "operation": "send",
        "sendTo": "={{ $json.email }}",
        "subject": "Kurze Rückfrage zu deiner Anfrage",
        "message": "Hallo, ich wollte kurz nachhaken, ob mein Angebot bei dir angekommen ist. Viele Grüße, {{ABSENDER_NAME}}"
      },
      "credential_type": "gmailOAuth2"
    }
  ],
  "connections": {
    "Täglich 9 Uhr": { "main": [[{ "node": "Leads lesen", "type": "main", "index": 0 }]] },
    "Leads lesen": { "main": [[{ "node": "Follow-up senden", "type": "main", "index": 0 }]] }
  }
}
```

## Nach dem Deployment
- Gmail-OAuth in n8n bestätigen.
- {{SHEET_ID}} und Spaltennamen prüfen.
- Workflow aktivieren (Toggle oben rechts).
