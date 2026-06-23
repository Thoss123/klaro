---
type: template_baustein
kategorie: credentials
n8n_nodes: [n8n-nodes-base.gmail, n8n-nodes-base.gmailTrigger, n8n-nodes-base.googleSheets, n8n-nodes-base.googleDocs, n8n-nodes-base.googleDrive, n8n-nodes-base.googleCalendar, n8n-nodes-base.youTube]
wiederverwendbar: true
---

# Google-Dienste verbinden: 3-Klick-Auth über Axantilos zentrale OAuth-App

## Das Prinzip
Alle Google-Nodes (Gmail, Sheets, Docs, Drive, Calendar, YouTube) authentifizieren sich über **Axantilos zentrale Google-OAuth-App**. Der User muss **keinen eigenen OAuth-Client** in der Google Cloud Console anlegen und keine Client-ID/Secret oder Token besorgen.

## Ablauf für den User (3 Klicks)
1. Im Credential-Dialog auf **„Mit Google verbinden"** klicken.
2. Im Google-Popup das **Konto auswählen**.
3. Den Zugriff **bestätigen** — fertig, das Credential ist einsatzbereit.

## Für den Agent / Coach
- NIEMALS anleiten, in der Google Cloud Console ein Projekt anzulegen, die Gmail-/Sheets-API zu aktivieren oder OAuth-Client-IDs zu erstellen — das übernimmt Axantilos zentrale App.
- Bei „Zugriff verweigert"/„invalid_grant": Verbindung im Credential-Dialog einmal trennen und die 3 Klicks wiederholen (Re-Consent).
- Scopes sind pro Dienst vordefiniert (Gmail: lesen/senden/labeln; Sheets/Docs/Drive: Dateien der App; Calendar: Termine).

## Grenzen
- Google Workspace-Admins können externe Apps blockieren — dann muss der Workspace-Admin Axantilos App freigeben (Admin Console → Sicherheit → API-Zugriffe).
- Sendelimits bleiben die des Google-Kontos (privat ~500 Empfänger/Tag, Workspace mehr).
