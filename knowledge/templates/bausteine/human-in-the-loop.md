---
type: template_baustein
kategorie: human-approval
n8n_nodes: [n8n-nodes-base.set, n8n-nodes-base.if]
wiederverwendbar: true
---

# Human-in-the-Loop (Freigabe vor Aktion)

## Was es ist
Ein Muster, bei dem der Workflow vor einer kritischen Aktion (Mail senden, Rechnung verschicken, Daten löschen) anhält und eine menschliche Freigabe einholt — typischerweise per WhatsApp oder E-Mail mit „Ja/Nein".

## Wann einsetzen
- Aktionen mit Außenwirkung (Kundenkommunikation, Zahlungen).
- Wenn die KI einen Entwurf erstellt, der noch geprüft werden soll.

## Wann NICHT einsetzen
- Rein interne, fehlertolerante Schritte (z. B. Daten in eine Tabelle schreiben).
- Hochfrequente Workflows, bei denen jede Freigabe den Durchsatz killt.

## Baustein-Kette
Entwurf erzeugen → Freigabe-Nachricht an Verantwortlichen → auf Antwort warten → IF „Ja" → Aktion ausführen / IF „Nein" → abbrechen + Hinweis

## n8n JSON (vollständig, einfügbar)
```json
[
  {
    "type": "n8n-nodes-base.set",
    "typeVersion": 3.4,
    "name": "Freigabe-Status",
    "parameters": {
      "assignments": {
        "assignments": [
          { "name": "approved", "type": "boolean", "value": "={{ $json.antwort === 'Ja' }}" }
        ]
      }
    }
  },
  {
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "name": "Freigegeben?",
    "parameters": {
      "conditions": {
        "conditions": [
          { "leftValue": "={{ $json.approved }}", "operator": { "type": "boolean", "operation": "true" } }
        ]
      }
    }
  }
]
```

## Variablen die angepasst werden müssen
- {{VERANTWORTLICHER_KONTAKT}}: WhatsApp-Nummer oder E-Mail für die Freigabe-Anfrage.
- {{ENTWURF}}: der Inhalt, der freigegeben werden soll.

## Kombination mit anderen Bausteinen
Direkt vor jedem „send"-Schritt einsetzbar, z. B. vor dem Gmail-Versand im Use Case „Angebot aus Gesprächsnotiz generieren".
