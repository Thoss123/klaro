---
type: template_baustein
kategorie: agent-context
n8n_nodes: [n8n-nodes-base.httpRequest]
wiederverwendbar: true
---

# Rules-Loader (Firmen- & Persona-Wissen in den Agent laden)

## Was es ist
Ein Baustein, der vor dem KI-Entwurf das firmenspezifische Wissen aus dem Axantilo-Workspace
zieht und in den System-Prompt des AI-Agents hängt: die firmenweite `rules/company_base.md`
(Fakten, Öffnungszeiten, Preise, No-Gos) plus die persönliche `rules/persona_<name>.md`
(Tonfall, Signatur, Ausnahmen). So schreibt der Agent inhaltlich korrekt UND im Stil der Person.

## Wann einsetzen
- In jedem Antwort-/Entwurf-Workflow direkt vor dem AI-Agent/der LLM-Chain.
- Überall, wo die Antwort an Firmen- oder Personen-Wissen angepasst werden soll.

## Wie es funktioniert
Ein **HTTP Request Node** liest die Regeln aus der App-API (`/api/workspace`). Authentifizierung
über den zentralen Maschinen-Token (`WORKSPACE_API_TOKEN`) als Bearer-Header — der zuständige User
wird serverseitig aus der `project_id` abgeleitet.

## Variablen
- `{{APP_BASE_URL}}`: Basis-URL der Axantilo-App (z.B. `https://app.axantilo.com`).
- `{{PROJECT_ID}}`: Projekt-ID (identifiziert Firma/Workspace).
- `{{PERSONA_PATH}}`: Pfad der Persona-Datei, z.B. `rules/persona_thomas.md` (aus dem sendenden Account).
- `WORKSPACE_API_TOKEN`: als n8n-Env/Credential, NICHT im Klartext im Workflow.

## Baustein-Kette
`company_base laden (HTTP GET)` → `persona laden (HTTP GET)` → `zusammenführen (Set)` → an AI-Agent als System-Prompt

## n8n JSON (vollständig, einfügbar)
```json
[
  {
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "name": "company_base laden",
    "parameters": {
      "url": "={{APP_BASE_URL}}/api/workspace?project_id={{PROJECT_ID}}&path=rules/company_base.md",
      "authentication": "genericCredentialType",
      "genericAuthType": "httpHeaderAuth",
      "options": {}
    }
  },
  {
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "name": "persona laden",
    "parameters": {
      "url": "={{APP_BASE_URL}}/api/workspace?project_id={{PROJECT_ID}}&path={{PERSONA_PATH}}",
      "authentication": "genericCredentialType",
      "genericAuthType": "httpHeaderAuth",
      "options": {}
    }
  },
  {
    "type": "n8n-nodes-base.set",
    "typeVersion": 3.4,
    "name": "System-Prompt bauen",
    "parameters": {
      "assignments": {
        "assignments": [
          {
            "name": "systemPrompt",
            "type": "string",
            "value": "=# Firmenwissen\n{{ $('company_base laden').item.json.content }}\n\n# Dein Stil (Persona)\n{{ $('persona laden').item.json.content }}"
          }
        ]
      }
    }
  }
]
```

## Kombination mit anderen Bausteinen
Direkt vor dem AI-Agent im Flow „Triage & Draft" einsetzen; das Ergebnis (`systemPrompt`) als
System-Message des Agents verwenden. Gegenstück ist die **Learning Engine** (Flow 2), die
`rules/company_base.md` und `rules/persona_<name>.md` per `PUT /api/workspace` fortschreibt.
