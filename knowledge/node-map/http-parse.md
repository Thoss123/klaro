---
type: template_baustein
kategorie: integration
n8n_nodes: [n8n-nodes-base.httpRequest, n8n-nodes-base.set, n8n-nodes-base.code]
wiederverwendbar: true
---

# Bau-Pattern: HTTP Request + Verarbeiten

## Wann nutzen
Wenn ein Dienst keinen fertigen n8n-Node hat oder eine spezielle API-Funktion gebraucht wird.

## So wird es gebaut
1. `n8n-nodes-base.httpRequest`: `method` (GET/POST) + `url` setzen.
2. Authentifizierung über generische Credentials — meist `httpHeaderAuth` (z. B. `Authorization: Bearer <KEY>`); der Key liegt im Credential, nie im Workflow-JSON.
3. Body für POST als JSON; dynamische Werte als Expressions (`={{ $json.feld }}`).
4. Die JSON-Antwort liegt danach direkt in `$json` — kein extra Parse-Schritt nötig.
5. Felder zurechtlegen: `n8n-nodes-base.set` (umbenennen/mappen) oder `n8n-nodes-base.code` (transformieren, filtern, Listen aufsplitten).

## Häufigste Fehler
- API-Key direkt in die URL/Header-Parameter schreiben statt ins Credential.
- Bei Listen-Antworten vergessen, dass n8n pro Item weiterarbeitet — ggf. mit Code-Node `return items.map(...)` aufsplitten.
