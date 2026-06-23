---
type: ui_guide
bereich: credentials
---

# Ein Tool / Credential in Axantilo verbinden

## Wo in der App
Sidebar → Settings → Tab „Credentials".

## Schritt für Schritt
1. In der Sidebar unten auf „Settings" klicken.
2. Den Tab „Credentials" öffnen.
3. Auf „+ Tool verbinden" klicken.
4. Das gewünschte Tool aus der Liste wählen (z. B. Gmail, Lexoffice).
5. Bei OAuth-Tools: „Mit … anmelden" klicken und im Popup den Zugriff bestätigen.
6. Bei API-Key-Tools: den Key aus dem Tool kopieren und ins Feld einfügen.
7. „Verbinden" klicken — ein grüner Haken bestätigt die Verbindung.

## Screenshots / Beschreibung
Nach erfolgreicher Verbindung erscheint das Tool mit grünem Status-Punkt in der Credential-Liste. Workflows, die dieses Tool nutzen, greifen automatisch darauf zu.

## Häufige Fehler
- „redirect_uri_mismatch": Die Redirect-URI in der Google/Microsoft-Konsole stimmt nicht mit der n8n-Callback-URL überein → exakt `https://DEINE-N8N-DOMAIN/rest/oauth2-credential/callback` eintragen.
- „invalid API key": Key mit Leerzeichen kopiert → neu kopieren, keine Leerzeichen am Rand.

## Verwandte Guides
- Gmail einrichten (siehe tools/gmail.md)
- Workflow aktivieren
