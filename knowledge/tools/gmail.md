---
type: tool
kategorie: email
kosten_free: ja — Gmail/Google Workspace Privatkonto kostenlos, Sendelimit 500 Empfänger/Tag
kosten_paid: Google Workspace ab 6 €/Monat pro Nutzer (höhere Limits, eigene Domain)
dsgvo: us-server-scc (Google Ireland, Standardvertragsklauseln, AVV verfügbar)
skill_level: niedrig
n8n_node: n8n-nodes-base.gmail
---

# Gmail

## Was es ist
Googles E-Mail-Dienst — in n8n als Node zum Lesen, Senden, Labeln und Durchsuchen von Mails per OAuth2.

## Wann empfehlen
- Das Unternehmen nutzt bereits Gmail oder Google Workspace.
- Outreach-, Benachrichtigungs- oder Auto-Reply-Workflows mit überschaubarem Volumen (< 500 Mails/Tag).
- Wenn du eingehende Mails als Trigger brauchst (neue Mail mit bestimmtem Label).

## Wann NICHT empfehlen
- Massenversand / Newsletter (> 500/Tag) → dediziertes Tool wie Brevo oder Mailjet.
- Transaktionale System-Mails aus einer App → SMTP-Dienst (Postmark, Resend).

## Credential einrichten — Schritt für Schritt
### In Google Cloud Console
1. console.cloud.google.com → Projekt anlegen.
2. "APIs & Services" → "Library" → Gmail API aktivieren.
3. "OAuth consent screen" → External → Pflichtfelder ausfüllen.
4. "Credentials" → "Create Credentials" → "OAuth client ID" → Web application.
5. Authorized redirect URI eintragen: `https://DEINE-N8N-DOMAIN/rest/oauth2-credential/callback`.
6. Client ID und Client Secret kopieren.

### In Klaro
1. Settings → Credentials → "+ Tool verbinden".
2. Gmail auswählen.
3. Client ID und Secret eintragen → "Mit Google anmelden" klicken und Zugriff bestätigen.

## n8n Node-Konfiguration
```json
{
  "type": "n8n-nodes-base.gmail",
  "typeVersion": 2.1,
  "parameters": {
    "resource": "message",
    "operation": "send",
    "sendTo": "{{KUNDEN_EMAIL}}",
    "subject": "{{BETREFF}}",
    "message": "{{TEXT}}"
  },
  "credential_type": "gmailOAuth2"
}
```

## Häufige Operationen
- message:send — Mail versenden
- message:getAll — Mails abrufen (z. B. neue mit Label X)
- message:addLabels — eingehende Mail kategorisieren

## Kosten-Details
Privat kostenlos (500 Empfänger/Tag). Workspace Business Starter 6 €/Monat → 2.000/Tag, eigene Domain, AVV.

## DSGVO & Datenschutz
Server primär USA, Vertragspartner Google Ireland. AVV + SCC verfügbar. Für DSGVO-kritische Inhalte (Gesundheit, Recht) eher EU-Anbieter wählen.

## Alternativen
- Microsoft Outlook: wenn das Team Microsoft 365 nutzt.
- SMTP (Postmark/Resend): rein transaktionale Mails aus Systemen.
