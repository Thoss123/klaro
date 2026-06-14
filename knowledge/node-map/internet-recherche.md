---
type: template_baustein
kategorie: research
n8n_nodes: [n8n-nodes-base.perplexity, n8n-nodes-base.rssFeedRead, n8n-nodes-base.httpRequest, n8n-nodes-base.html, n8n-nodes-base.removeDuplicates]
wiederverwendbar: true
---

# Bau-Pattern: Internet-Recherche

## Wann nutzen
Wenn der Workflow aktuelle Informationen aus dem Web braucht — Marktbeobachtung, News-Monitoring, Konkurrenz-Recherche, Fakten für KI-Texte.

## Die drei Wege
### 1. KI-Websuche mit Quellen (Perplexity)
`n8n-nodes-base.perplexity` mit `chat:complete` — stellt eine Frage und bekommt eine Antwort mit aktuellen Web-Quellen/Zitaten. Für rohe Suchtreffer die `search`-Resource. Credential: Perplexity API-Key.

### 2. News-/Blog-Monitoring (RSS)
`n8n-nodes-base.rssFeedRead` mit Feed-URL, kombiniert mit Schedule Trigger (z. B. stündlich). Danach `removeDuplicates` im Modus „Items aus früheren Ausführungen" — so wird jeder Artikel nur einmal verarbeitet.

### 3. Konkrete Webseite auslesen (Scraping)
`httpRequest` (GET auf die URL) → `n8n-nodes-base.html` mit Operation `extractHtmlContent` und CSS-Selektoren (z. B. `h1`, `.price`). Nur für Seiten ohne Login/JS-Rendering geeignet.

## Recherche als Agent-Werkzeug
Soll ein AI Agent selbst entscheiden, wann er sucht: Perplexity oder HTTP Request als **ai_tool-Sub-Node** an den Agent hängen — nicht als eigenen Schritt in den Hauptflow.

## Häufigste Fehler
- Scraping auf JS-lastigen Seiten (leeres HTML) → besser Perplexity oder eine offizielle API.
- RSS ohne Deduplizierung → dieselben Artikel werden bei jedem Lauf erneut verarbeitet.
