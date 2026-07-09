---
type: use_case
branche: allgemein
funktion: nachfassen
roi_stunden_pro_monat: 6
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung, datenablage]
---

# Follow-up-Serie (Nachfassen nach Angebot, Tag 3/7/14)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "ich schicke Angebote
raus und dann passiert oft einfach nichts", "ich vergesse nachzufassen",
oder "vieles verläuft im Sand, weil ich keine Zeit hab, hinterherzutelefonieren".
Klassisches Signal: hohe Zahl versendeter Angebote, aber niedrige
Abschlussquote, weil Nachfassen mangels Zeit/System unterbleibt.

## Baustein-Kette
1. Angebot wurde verschickt → Eintrag in der Datenablage mit Stage "T0" und
   Zeitstempel anlegen
2. Zeitgesteuerter Check (täglich): welche Angebote sind seit 3/7/14 Tagen
   ohne Antwort?
3. Tag 3: persönliche, kurze Nachfrage ("Gibt's noch offene Fragen zum
   Angebot?")
4. Tag 7: zweite Erinnerung, etwas konkreter (z.B. Verfügbarkeit/Termin
   anbieten)
5. Tag 14: letzte freundliche Erinnerung mit Ausstiegsoption ("Soll ich das
   Angebot ad acta legen?")
6. Antwortet der Kunde zu irgendeinem Zeitpunkt → Serie stoppt, Stage auf
   "beantwortet" setzen

## Benötigte Tools
- Gmail/Outlook: Versand der Nachfass-Mails
- KI (läuft über Axantilo): jede Nachricht persönlich formuliert, nicht als
  Textbaustein-Wiederholung
- Datenablage (`/api/agent/data`): hält den Stage-Zustand pro Angebot

## Typische Ist-Tools & Datenquellen
Angebote liegen meist in Mail-Verlauf oder einer Tabelle; Nachfassen passiert
– wenn überhaupt – manuell nach Bauchgefühl, ohne festen Rhythmus.

## Benötigte Zugänge
- Mail-Postfach (Gmail/Outlook)
- Zentrale Datenablage-Credential (httpHeaderAuth, automatisch gesetzt)
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Welche Ereignisse zählen als "beantwortet" (Antwort-Mail, Anruf, Auftrag)?
- Sollen alle drei Stufen automatisch raus oder ab welcher Stufe zur
  Freigabe?
- Gibt es Angebote, die NIE nachgefasst werden sollen (z.B. abgelehnte)?

## Referenz-Workflow-Aufbau
Persistenz über die zentrale Datenablage — **niemals parallele Wait-Nodes**
für T3/T7/T14, sondern eine Stage-Logik in der Datenablage (siehe
`knowledge/templates/bausteine/datenablage-api.md`):

1. `scheduleTrigger` (täglich, z.B. 08:00)
2. `httpRequest` — offene Angebote aus Datenablage lesen (op `select`,
   jsonb-Filter auf Stage + Alter in Tagen)
3. `if`/`switch` — Alter in Tage(n) seit Versand bucketen (3/7/14)
4. `chainLlm` — passenden Nachfass-Text je Stage formulieren (Lead-Kontext +
   bisherige Mails als Variablen)
5. `gmail` — Mail senden
6. `httpRequest` — Stage in der Datenablage fortschreiben (op `update`)

## ROI
Bei 15 Angeboten/Monat, von denen sonst die Hälfte unbeantwortet
verloren geht: ~6 h/Monat gesparte Handarbeit, plus messbar mehr
Abschlüsse durch konsequentes Nachfassen statt Vergessen.

## Grenzen
Zu aggressives Nachfassen wirkt aufdringlich — Ton muss persönlich und
zurückhaltend bleiben, kein Newsletter-Charakter. Kunden, die aktiv absagen,
sofort aus der Serie nehmen.

## Verwandte Use Cases
- Angebots-Autopilot (erzeugt die Angebote, die hier nachgefasst werden)
- Lead-Qualifizierung (bestimmt, welche Leads überhaupt ein Angebot bekommen)
