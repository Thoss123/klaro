---
type: template_baustein
kategorie: credentials
n8n_nodes: [n8n-nodes-base.emailSend]
wiederverwendbar: true
---

# E-Mails senden mit Resend (zentrale SMTP-Credential)

## Das Prinzip
Alle transaktionalen E-Mails (Benachrichtigungen, Berichte, Bestätigungen) laufen über **Axantilos zentralen Resend-Account** (`hello@axantilo.com`). Der Nutzer muss **keine eigene E-Mail-Infrastruktur** einrichten oder Credentials anlegen.

## Ablauf für den Nutzer (0 Klicks)
Die SMTP-Credential ist bereits gesetzt — der Workflow deployed direkt ohne manuelle Credential-Eingabe.

## Für den Agent / Coach
- Node: `n8n-nodes-base.emailSend` (Send Email / SMTP)
- Parameter setzen: `fromEmail`, `toEmail`, `subject`, `text` (oder `html`)
- Credential ist automatisch vorhanden (zentral, kein User-Setup)
- NIEMALS anleiten, einen eigenen Resend-Account oder SMTP-Server einzurichten

## Wann Gmail vs. Resend?
- **Gmail-Node** (`n8n-nodes-base.gmail`): Wenn der Nutzer aus seinem persönlichen/Firmen-Gmail-Postfach mailt (CRM-Follow-ups, persönliche Antworten). Erfordert 3-Klick-OAuth.
- **Resend/SMTP-Node** (`n8n-nodes-base.emailSend`): Für System-Mails, Berichte, Benachrichtigungen, die von `hello@axantilo.com` kommen sollen. Kein User-Setup.

## Typisches Beispiel
```
Webhook Trigger → KI-Agent (Bericht generieren) → Send Email
  fromEmail: "hello@axantilo.com"
  toEmail: "={{ $json.email }}"
  subject: "Dein wöchentlicher Report"
  text: "={{ $json.reportText }}"
```

## Limits
- Resend-Sendelimits gelten pro Domain. Für hohes Volumen (> 10.000 Mails/Monat) Resend-Plan upgraden.
- Anhänge: per `attachments`-Parameter möglich (base64-kodiert).
