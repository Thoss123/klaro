---
type: template_baustein
kategorie: credentials
n8n_nodes: [n8n-nodes-base.twilio, n8n-nodes-base.whatsApp]
wiederverwendbar: true
---

# SMS und WhatsApp senden via Twilio (zentrale Credential)

## Das Prinzip
SMS und WhatsApp-Nachrichten laufen über **Axantilos zentralen Twilio-Account**. Der Nutzer muss **keinen eigenen Twilio-Account** anlegen oder Credentials eingeben.

## Ablauf für den Nutzer (0 Klicks)
Credential ist automatisch gesetzt — Workflow deployed direkt.

## Für den Agent / Coach
- **SMS** → `n8n-nodes-base.twilio` (Twilio-Node)
  - Parameter: `to` (Empfänger +49…), `body` (Nachricht)
  - `from` ist die zentrale Axantilo-Twilio-Nummer — wird automatisch gesetzt
- **WhatsApp via Twilio** → ebenfalls `n8n-nodes-base.twilio`
  - `to`: `whatsapp:+49XXXXXXXXX` (mit `whatsapp:`-Präfix!)
  - `from`: `whatsapp:+1XXXXXXXXX` (Axantilo-Sandbox/Produktionsnummer)
- NIEMALS anleiten, einen eigenen Twilio-Account oder WhatsApp-Business-Account anzulegen

## WhatsApp: Sandbox vs. Produktion

### Sandbox (Entwicklung / Alpha)
- Kostenlos, sofort nutzbar
- Nutzer muss einmalig eine Opt-in-Nachricht an die Sandbox-Nummer schicken (Twilio Console → Messaging → WhatsApp → Sandbox)
- Einschränkung: Nur Nutzer, die Opt-in gemacht haben, empfangen Nachrichten

### Produktion
- Erfordert Meta-Business-Verifizierung + Twilio-WhatsApp-Sender-Antrag (Tage bis Wochen)
- Danach unbeschränkt, keine Opt-in-Pflicht

## Wann Twilio vs. WhatsApp Business Cloud (Meta)?
- **Twilio** (`n8n-nodes-base.twilio`): Einfacherer Weg, beide Kanäle (SMS + WhatsApp) über eine Credential. Für Axantilo Standard.
- **WhatsApp Business Cloud** (`n8n-nodes-base.whatsApp`): Direkte Meta-API, mehr WhatsApp-Funktionen (Templates, Buttons), eigene Phone-Number-ID nötig. Nur wenn spezifische WA-Features gebraucht werden.

## Typisches Beispiel (WhatsApp-Agent)
```
Webhook Trigger (eingehende WA-Nachricht) → KI-Agent (Antwort generieren) → Twilio
  to: "whatsapp:={{ $json.from }}"
  body: "={{ $json.agentResponse }}"
```

## Limits
- Twilio SMS: ~$0.01/Nachricht (DE-Nummern höher)
- WhatsApp: kostenlos bis 1.000 Service-Gespräche/Monat (Meta-Preismodell)
