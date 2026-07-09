---
type: template_baustein
kategorie: data-storage
n8n_nodes: [n8n-nodes-base.httpRequest]
wiederverwendbar: true
---

# Datenablage-API (Zeilen-Speicher ohne Google Sheets)

## Was es ist
Ein generischer, projekt-scoped Zeilen-Speicher (Supabase, `user_data_rows`), den ein
Workflow über einen einzigen HTTP-Request-Node ansprechen kann — für alles, was der
Workflow sich „merken" muss: welcher Lead welche Follow-up-Mail schon bekommen hat, ob
eine Rechnung bezahlt/gemahnt wurde, Sync-Buchhaltung zwischen zwei Systemen. Kein Setup
für den Nutzer nötig (im Gegensatz zu Google Sheets), läuft automatisch mit der bei jedem
Projekt auto-provisionierten Datenablage.

## Wann einsetzen
- Follow-up-Serien, die sich merken müssen, welcher Schritt (T3/T7/T14 o. Ä.) schon lief.
- Rechnungs-/Mahnwesen-Flows, die den Status (offen/gesendet/bezahlt) pro Rechnung tracken.
- Datenabgleich zwischen zwei Systemen, der Bookkeeping über mehrere Läufe braucht.
- Immer, wenn der Nutzer keine eigene Datenbank/Sheet angebunden hat.

## Wann NICHT einsetzen
- Wenn der Nutzer bereits ein eigenes System (CRM, eigene DB, Sheets) als Datenablage
  gewählt hat — dann dessen Node verwenden, nicht die Axantilo-API.
- Für große Datenmengen oder komplexe Relationen — das ist ein einfacher JSONB-Zeilen-
  Speicher, kein vollwertiges DB-Schema.

## Baustein-Kette
HTTP-Request-Node (POST `/api/agent/data`, `op` steuert die Operation) → IF/weitere
Verarbeitung je nach `rows`/`deleted` im Response.

## API
- Basis-URL: `{{APP_BASE_URL}}/api/agent/data`
- Auth: `Authorization: Bearer <WORKSPACE_API_TOKEN>` — im Node über die zentrale
  Header-Auth-Credential (`httpHeaderAuth`), NICHT manuell eintragen.
- Body immer: `{ project_id, table, op, ... }` — `table` ist ein frei wählbarer, logischer
  Tabellenname (z. B. `"leads_followup"`); wird beim ersten Zugriff automatisch angelegt.
- `filter` ist ein flaches Objekt (Top-Level-Key → Wert), das per JSONB-Containment auf
  `data` gematcht wird (z. B. `{"lead_id": "123"}` matcht Zeilen mit `data.lead_id === "123"`).

| op | Pflichtfelder | Beschreibung |
|----|---------------|--------------|
| `select` | — | `filter?`, `id?`, `limit?` (Default 100, max 500), `order?` (`asc`/`desc`) |
| `insert` | `row` ODER `rows` | einzelnes Objekt oder Array (max. 100) |
| `update` | `id` ODER `filter`, `data` | `data` wird in bestehendes JSONB **gemerged**, nicht überschrieben |
| `delete` | `id` ODER `filter` | mindestens eins Pflicht — kein Löschen aller Zeilen möglich |

## n8n JSON (vollständig, einfügbar)
```json
{
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "name": "Datenablage: Lead-Status setzen",
  "parameters": {
    "method": "POST",
    "url": "={{ $env.APP_BASE_URL }}/api/agent/data",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ project_id: $env.PROJECT_ID, table: 'leads_followup', op: 'update', filter: { lead_id: $json.lead_id }, data: { last_step: 'T7', sent_at: $now.toISO() } }) }}",
    "sendHeaders": false,
    "genericAuthType": "httpHeaderAuth"
  },
  "credentials": {
    "httpHeaderAuth": { "id": "{{WORKSPACE_TOKEN_CREDENTIAL_ID}}", "name": "httpHeaderAuth" }
  }
}
```

## Variablen die angepasst werden müssen
- {{APP_BASE_URL}}: Basis-URL der Axantilo-App (z. B. aus Umgebungsvariable im Workflow).
- {{PROJECT_ID}}: Projekt-ID, in dessen Datenablage geschrieben wird.
- `table`: logischer Tabellenname, pro Anwendungsfall frei wählbar (z. B. `leads_followup`,
  `rechnungen_status`).
- {{WORKSPACE_TOKEN_CREDENTIAL_ID}}: wird beim Deploy automatisch durch die zentrale
  Header-Auth-Credential ersetzt — nie manuell setzen.

## Kombination mit anderen Bausteinen
- Vor einem Follow-up-Versand: `select` mit `filter` prüft, ob der nächste Schritt schon
  gesendet wurde (Duplikat-Schutz).
- Nach erfolgreichem Versand: `update` (oder `insert`, falls noch keine Zeile existiert)
  schreibt den neuen Stand.
- Mit Human-in-the-Loop kombinierbar: Freigabe-Status kann ebenfalls in der Datenablage
  statt in `agent_pending_actions` liegen, wenn kein WhatsApp-Kanal genutzt wird.
