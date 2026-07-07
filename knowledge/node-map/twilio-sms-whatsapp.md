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
  - Parameter: `to` (Empfänger +49…), `message` (Nachricht)
  - `from` ist die zentrale Axantilo-Twilio-Nummer — wird automatisch gesetzt
- **WhatsApp via Twilio** → ebenfalls `n8n-nodes-base.twilio` mit `toWhatsapp: true`
  - `to`: NACKTE Nummer `+49XXXXXXXXX` — KEIN `whatsapp:`-Präfix! Der Node präfixt bei
    `toWhatsapp: true` selbst; doppeltes Präfix → Twilio-Error 21211 „not a valid phone number".
  - `from`: muss ein WhatsApp-CHANNEL sein — Sandbox: `+14155238886` (universell).
    Die eigene SMS-Nummer als `from` → Error 63007 „could not find a Channel".
  - Inbound-Webhooks: Twilio sendet `From` als `whatsapp:+49…` — dieses Format für
    Lookups (z.B. `agent_pending_actions.contact`) verwenden.
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
