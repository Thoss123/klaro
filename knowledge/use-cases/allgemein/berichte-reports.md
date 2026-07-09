---
type: use_case
branche: allgemein
funktion: reporting
roi_stunden_pro_monat: 5
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [google-sheets, ki-textgenerierung, gmail]
---

# Berichte & Reports (Wochenbericht/Kennzahlen vorformuliert)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "ich muss dem Kunden
regelmäßig Status geben und das kostet mich jedes Mal einen halben Abend"
oder "Kennzahlen zusammensuchen und in Worte fassen ist lästige
Fleißarbeit". Typisches Signal: wiederkehrende Berichte (an Kunden, an sich
selbst, ans Team) mit im Kern gleichbleibender Struktur, aber wechselnden
Zahlen/Inhalten.

## Baustein-Kette
1. Zeitgesteuert (z.B. jeden Freitag) oder nach Datenabschluss: Kennzahlen
   aus der Datenquelle ziehen (Tabelle, CRM, Datenablage)
2. KI formuliert daraus einen Wochenbericht/Status im Ton des Absenders —
   nicht nur Zahlen auflisten, sondern kurz einordnen (Trend, Auffälligkeiten)
3. Entwurf zur Freigabe (Human-in-the-Loop) oder direkt versenden, je nach
   Vertrauensstufe
4. Bericht archivieren/ablegen

## Benötigte Tools
- Google Sheets oder Datenquelle mit den Kennzahlen
- KI (läuft über Axantilo): formuliert den Bericht im Ton des Absenders
- Gmail/Outlook: Versand an Kunden/Team

## Typische Ist-Tools & Datenquellen
Kennzahlen liegen meist verstreut (Tabellen, CRM, Kopfrechnung); der Bericht
wird von Hand zusammengeschrieben, oft nach demselben Muster jede Woche.

## Benötigte Zugänge
- Google-Konto (Sheets) — zentraler 3-Klick-OAuth
- Mail-Postfach (Gmail/Outlook) für den Versand
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Welche Kennzahlen genau, und wo liegen sie heute (eine oder mehrere
  Quellen)?
- Wer bekommt den Bericht (Kunde, intern, beides) und in welchem Rhythmus?
- Soll er automatisch raus oder erst nach Freigabe?

## Referenz-Workflow-Aufbau
1. `scheduleTrigger` (z.B. freitags 16:00)
2. `googleSheets`/`httpRequest` — Kennzahlen der Woche lesen
3. `chainLlm` mit Prompt-Key `report/weekly` — Bericht aus Kennzahlen im
   Ton des Absenders formulieren (Persona wird serverseitig injiziert)
4. Human-in-the-Loop-Baustein bei Kundenberichten
   (`knowledge/templates/bausteine/human-in-the-loop.md`), sonst direkt
5. `gmail` — Versand; `googleDrive`/Datenablage — Archivierung

## ROI
Bei einem wöchentlichen Bericht à 1-1,5 h Zusammenstellen: ~5 h/Monat
gespart. Wichtiger: Berichte kommen pünktlich und regelmäßig, statt erst
auf Nachfrage.

## Grenzen
Zahlen müssen aus einer verlässlichen Quelle stammen — die KI darf nichts
schätzen oder interpolieren, was nicht in den Daten steht. Bei
Kundenberichten mit heiklen Zahlen (z.B. Verzögerungen) erste Versionen zur
Freigabe.

## Verwandte Use Cases
- Gesprächsnotizen (liefern oft Inhalte für den Bericht)
- Datenpflege (saubere Datenquelle ist Voraussetzung für verlässliche Reports)
