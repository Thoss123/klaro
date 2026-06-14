---
type: template_baustein
kategorie: flow
n8n_nodes: [n8n-nodes-base.if, n8n-nodes-base.switch, n8n-nodes-base.merge]
wiederverwendbar: true
---

# Bau-Pattern: Verzweigung & Merge

## Wann nutzen
Wenn der Workflow je nach Bedingung unterschiedliche Wege gehen soll („wenn Lead heiß → sofort anrufen, sonst → Newsletter") und die Zweige danach ggf. wieder zusammenlaufen.

## So wird es gebaut
### IF (2 Wege)
1. `n8n-nodes-base.if` nach dem Schritt einfügen, dessen Daten geprüft werden.
2. Bedingungen in `parameters.conditions` (Feld, Operator, Wert — Feld als Expression `={{ $json.feld }}`).
3. Zwei ausgehende Verbindungen: Edge mit `branch: "true"` für den Ja-Zweig, `branch: "false"` für den Nein-Zweig.

### Switch (3+ Wege)
1. `n8n-nodes-base.switch` mit Regeln pro Fall.
2. Ausgänge über `branch: "switch-0"`, `"switch-1"`, `"switch-2"` … verbinden.

### Merge (Zweige zusammenführen)
1. `n8n-nodes-base.merge` dort einfügen, wo die Zweige wieder ein Strang werden.
2. Eingehende Edges unterscheiden sich per `targetInput: 0` und `targetInput: 1`.

## Häufigster Fehler
Zweige enden „ins Leere" oder beide IF-Ausgänge zeigen auf denselben Schritt ohne `branch`-Angabe — dann ist nicht definiert, welcher Weg gilt. Jede Edge aus IF/Switch braucht ihre `branch`-Markierung.
