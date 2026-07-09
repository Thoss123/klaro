---
type: baustein
name: dedupe-sync
verwendet_von: [datenpflege]
---

# Baustein: Dedupe & Sync (Datenpflege)

Wiederverwendbarer **Code-Node**-Baustein für Datenpflege-Workflows: normalisiert Kontakte aus
zwei Quellen (z.B. CRM + Tabelle), findet Duplikate/Abweichungen über einen stabilen Schlüssel
(normalisierte E-Mail bzw. Telefonnummer) und schlägt Zusammenführungen vor. Die eigentliche
Anwendung der Änderungen läuft **nie blind**, sondern über eine Freigabe-Liste
(`knowledge/templates/bausteine/human-in-the-loop.md`) — der Nutzer bestätigt, dann werden die
Updates geschrieben (Datenablage/CRM).

## Prinzip
1. Beide Quellen lesen (je ein Read-Node → Merge oder zwei Inputs).
2. Pro Datensatz einen **Match-Key** bilden: E-Mail lowercased/getrimmt; Telefon auf Ziffern
   reduziert (führende 0/+49 → einheitlich). Fehlt beides, Datensatz überspringen (nicht raten).
3. Nach Key gruppieren: mehrfach = Duplikat-Kandidat; unterschiedliche Felder bei gleichem Key =
   Sync-Abweichung.
4. Vorschlagsliste ausgeben (nicht anwenden) → Freigabe → Updates.

## Code-Node (runOnceForAllItems)
```javascript
// Erwartet: alle Items beider Quellen im Input, je mit { email, phone, name, source, ...felder }.
const norm = {
  email: (v) => (v || '').toString().trim().toLowerCase(),
  phone: (v) => (v || '').toString().replace(/\D/g, '').replace(/^0/, '49'),
};
const keyOf = (r) => norm.email(r.email) || norm.phone(r.phone) || '';

const byKey = new Map();
for (const item of $input.all()) {
  const r = item.json;
  const key = keyOf(r);
  if (!key) continue; // kein stabiler Schlüssel -> nicht raten
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r);
}

const vorschlaege = [];
for (const [key, records] of byKey) {
  if (records.length < 2) continue; // nur Duplikate/Abweichungen sind interessant
  // Felder zusammenführen: erster nicht-leerer Wert je Feld gewinnt (deterministisch).
  const merged = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (merged[k] === undefined || merged[k] === '' || merged[k] === null) merged[k] = v;
    }
  }
  vorschlaege.push({
    json: {
      match_key: key,
      anzahl: records.length,
      quellen: records.map((r) => r.source).filter(Boolean),
      vorschlag: merged,
    },
  });
}
return vorschlaege;
```

## Danach
- Vorschlagsliste → Freigabe (HITL-Baustein): Nutzer bestätigt pro Merge oder gesammelt.
- Erst nach Freigabe: Updates in Datenablage (`/api/agent/data` op `update`) bzw. ins CRM
  zurückschreiben. Nie ohne Freigabe automatisch mergen (Datenverlust-Risiko).
