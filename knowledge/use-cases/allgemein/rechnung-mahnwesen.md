---
type: use_case
branche: allgemein
funktion: rechnungen
roi_stunden_pro_monat: 6
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [google-docs, gmail, datenablage]
---

# Rechnung & Mahnwesen (Auftrag fertig → Rechnung, Erinnerung, Ablage)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "Rechnungen schreib
ich meistens am Monatsende in einem Rutsch" oder "ich vergesse regelmäßig,
bei offenen Zahlungen nachzuhaken — das kostet mich Liquidität". Typisches
Signal: Auftrag ist längst erledigt, aber Rechnungsstellung und Mahnwesen
laufen unsystematisch oder stark verzögert hinterher.

## Baustein-Kette
1. Auftrag ist abgeschlossen (Häkchen/Status oder Trigger aus vorherigem
   Workflow) → Rechnung aus Vorlage mit Leistung/Betrag erzeugen
2. Rechnung als PDF an den Kunden versenden, Status "offen" mit
   Fälligkeitsdatum in der Datenablage anlegen
3. Zeitgesteuerter Check: Fälligkeit überschritten und noch nicht bezahlt?
4. Stufe 1 (freundliche Erinnerung) → Stufe 2 (bestimmter, mit Frist) →
   Stufe 3 (Mahnung, eskalierend im Ton) — jeweils mit Datenablage-Stage
5. Zahlungseingang gemeldet → Serie stoppt, Status "bezahlt", Ablage

## Benötigte Tools
- Google Docs + Drive (PDF-Export): Rechnungs-/Mahnvorlage mit Platzhaltern
- Gmail/Outlook: Versand
- Datenablage (`/api/agent/data`): Status, Fälligkeit, Mahnstufe pro
  Rechnung

## Typische Ist-Tools & Datenquellen
Rechnungen entstehen oft in Word/Excel oder einer Buchhaltungssoftware;
Mahnwesen läuft — wenn überhaupt — manuell und unregelmäßig, meist erst
wenn es aus Liquiditätsgründen dringend wird.

## Benötigte Zugänge
- Google-Konto (Docs/Drive) — zentraler 3-Klick-OAuth
- Mail-Postfach (Gmail/Outlook)
- Zentrale Datenablage-Credential (automatisch gesetzt)
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Nutzt der Betrieb bereits eine Buchhaltungssoftware (z.B. für die
  fortlaufende Rechnungsnummer), die eingebunden werden muss?
- Wie viele Mahnstufen sind rechtlich/geschäftlich üblich, welche Fristen?
- Wie wird ein Zahlungseingang erkannt (manuell bestätigt oder aus einem
  Zahlungstool)?

## Referenz-Workflow-Aufbau
Stage-Logik über die zentrale Datenablage statt paralleler Wait-Nodes (siehe
`knowledge/templates/bausteine/datenablage-api.md`):

1. Trigger: Auftragsabschluss (`webhook`/`manualTrigger` je nach Quelle)
2. `googleDocs` (createFromTemplate) → `googleDrive` (PDF-Export) —
   Rechnung erzeugen
3. `gmail` — Rechnung senden; `httpRequest` — Eintrag in Datenablage
   (op `insert`, Status "offen", Fälligkeit)
4. `scheduleTrigger` (täglich) → `httpRequest` (op `select`, jsonb-Filter
   auf Status "offen" + überfällig)
5. `switch` über Mahnstufe → `chainLlm` mit Prompt-Key `invoice/reminder`
   (Ton eskalierend je Stufe) → `gmail` → `httpRequest` (op `update`,
   Mahnstufe hoch)

## ROI
Bei 15 Rechnungen/Monat und aktuell unsystematischem Mahnwesen: ~6 h/Monat
gespart, plus spürbar schnellerer Zahlungseingang durch konsequentes,
rechtzeitiges Nachfassen.

## Grenzen
Mahnungen sind rechtlich sensibel — Fristen und Formulierungen mit dem
Nutzer klären, nichts erfinden. Bei Streitfällen/Reklamationen die
automatische Mahnstufe pausieren und persönlich klären lassen.

## Verwandte Use Cases
- Datenpflege (Kundendaten/Rechnungsadressen bleiben konsistent)
- Berichte & Reports (offene Posten fließen in interne Reports ein)
