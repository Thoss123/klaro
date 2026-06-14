---
type: template_baustein
kategorie: data
n8n_nodes: [n8n-nodes-base.set, n8n-nodes-base.code]
wiederverwendbar: true
---

# Bau-Pattern: Expressions (Datenfluss zwischen Schritten)

## Wann nutzen
Immer, wenn ein Feld dynamische Daten aus einem vorherigen Schritt braucht — Empfänger-Adresse, Betreff, Texte, IDs.

## So wird es gebaut
- Dynamischer Wert: führendes `=`, dann `{{ … }}`:
  `"sendTo": "={{ $json.email }}"`
- Daten des direkten Vorschritts: `$json.feldname`.
- Daten eines bestimmten Schritts: `={{ $('Node Name').item.json.feldname }}`.
- Text mit eingebetteten Werten mischen:
  `"subject": "=Neue Anfrage von {{ $json.name }}"`
- Statische Werte OHNE `=` schreiben.

## Im Code-Node
JavaScript gehört in `parameters.jsCode`. Eingehende Items: `$input.all()`. Rückgabe: Array von `{ json: { … } }`.

## Häufigste Fehler
- `{{ $json.feld }}` ohne führendes `=` → n8n behandelt es als statischen Text.
- Feldnamen geraten — Felder vorher per Testlauf prüfen (verfügbare Eingangsfelder).
- `$json` in einem Schritt nutzen, der mehrere Eingänge hat (Merge) — dort lieber `$('Node Name')`-Syntax.
