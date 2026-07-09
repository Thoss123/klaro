---
type: use_case
branche: allgemein
funktion: termine
roi_stunden_pro_monat: 5
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [google-calendar, ki-textgenerierung, google-sheets]
---

# Gesprächsnotizen (Zusammenfassung, To-dos, CRM-Update nach jedem Termin)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "nach dem Gespräch
schreib ich mir was auf, aber oft erst Stunden später und dann fehlt schon
was" oder "was in dem Termin besprochen wurde, steht nirgends fest — nur in
meinem Kopf". Typisches Signal: viele Kunden-/Beratungstermine, aber keine
systematische Dokumentation von Ergebnissen und Folgeaufgaben.

## Baustein-Kette
1. Termin ist beendet (Kalender-Ende oder manueller Trigger)
2. Notiz/Transkript erfassen (Diktat, Stichpunkte oder Meeting-Bot-Transkript
   — falls ein Tool wie Fireflies/Otter/tl;dv bereits selbst transkribiert,
   wird DAS als Quelle angebunden, kein separater KI-Transkriptionsschritt)
3. KI strukturiert daraus: Zusammenfassung, To-dos, nächste Schritte (JSON)
4. Zusammenfassung + To-dos in CRM/Liste eintragen
5. Optional: Erinnerung an offene To-dos zu einem späteren Zeitpunkt

## Benötigte Tools
- Google Calendar: erkennt Termin-Ende, liefert Kontext (wer, wann, Thema)
- KI (läuft über Axantilo): strukturiert Notiz → Zusammenfassung + To-dos
- Google Sheets oder CRM: Ablage der Notiz und To-dos

## Typische Ist-Tools & Datenquellen
Termine stehen im Kalender; Notizen entstehen (wenn überhaupt) handschriftlich
oder als lose Stichpunkte, die nicht systematisch abgelegt werden.

## Benötigte Zugänge
- Google Calendar — zentraler 3-Klick-OAuth
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig
- Ggf. Zugang zum bestehenden CRM/zur Tabelle

## Klärfragen für Phase 2
- Wie kommt die Rohnotiz zustande — Diktat, Stichpunkte, oder ein
  Meeting-Bot, der selbst transkribiert?
- Wohin sollen Zusammenfassung + To-dos (CRM, Tabelle, beides)?
- Sollen To-dos automatisch als Erinnerung wiederkommen?

## Referenz-Workflow-Aufbau
1. `googleCalendar` (event:getAll, Termin-Ende) oder `manualTrigger`/`webhook`
   bei Meeting-Bot-Quelle (siehe `matchToolCapability` in `lib/node-map.ts`
   für Fireflies/Otter/tl;dv als selbst-liefernde Transkript-Quelle)
2. `informationExtractor` bzw. `chainLlm` mit Prompt-Key `notes/summarize` —
   liefert Zusammenfassung + To-dos als JSON
3. `googleSheets`/`httpRequest` (CRM-API oder Datenablage) — Eintrag anlegen
4. Optional: `scheduleTrigger` + Datenablage-Check für offene To-dos

## ROI
Bei 15 Terminen/Monat à ~20 Min Nachbereitung: ~5 h/Monat gespart. Wichtiger:
nichts Besprochenes geht mehr verloren, CRM ist immer aktuell.

## Grenzen
Bei sensiblen Gesprächsinhalten (z.B. Gehaltsverhandlungen, persönliche
Themen) genau klären, was überhaupt automatisch dokumentiert werden darf.

## Verwandte Use Cases
- Berichte & Reports (Zusammenfassungen fließen oft in Wochenberichte ein)
- Datenpflege (CRM-Einträge bleiben so konsistent)
