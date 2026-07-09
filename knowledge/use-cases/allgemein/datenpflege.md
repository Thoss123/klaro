---
type: use_case
branche: allgemein
funktion: datenpflege
roi_stunden_pro_monat: 4
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [google-sheets, datenablage]
---

# Datenpflege (Kontakte synchron, Duplikate zusammenführen)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "meine Kontakte
stehen in drei verschiedenen Listen und die stimmen nie überein" oder "ich
trag denselben Kunden ständig doppelt ein, weil ich nicht weiß, ob er schon
drin ist". Typisches Signal: mehrere Datenquellen (Mail-Kontakte, Tabelle,
CRM, Newsletter-Tool), die manuell synchron gehalten werden müssen und
regelmäßig auseinanderlaufen.

## Baustein-Kette
1. Neuer/geänderter Kontakt in einer Quelle (z.B. neue Anfrage, manuelle
   Änderung) → erkannt
2. Abgleich gegen bestehende Einträge (per Mail/Name/Telefonnummer) —
   existiert der Kontakt schon?
3. Neu: Eintrag in allen relevanten Systemen anlegen
4. Bestehend, aber abweichend: Daten zusammenführen (welche Version ist
   aktueller/vollständiger?), Duplikate markieren/zusammenlegen
5. Änderung in alle angebundenen Systeme spiegeln

## Benötigte Tools
- Google Sheets oder CRM als führendes System (oder mehrere synchron zu
  haltende Systeme)
- Datenablage (`/api/agent/data`) als zentrale Abgleichsquelle bei mehreren
  Zielsystemen

## Typische Ist-Tools & Datenquellen
Kontakte verteilen sich typischerweise über Mail-Postfach, eine Tabelle,
ein CRM und/oder ein Marketing-Tool — jedes mit eigenem Stand, ohne
automatischen Abgleich.

## Benötigte Zugänge
- Google-Konto (Sheets) — zentraler 3-Klick-OAuth, falls Google Sheets als
  System beteiligt ist
- Zugang zu jedem weiteren System, das synchron gehalten werden soll (CRM,
  Newsletter-Tool)
- KI-Schritte (Duplikat-Erkennung bei unscharfen Treffern) laufen über
  Axantilo

## Klärfragen für Phase 2
- Welche Systeme genau sollen synchron gehalten werden, und welches ist
  die "Quelle der Wahrheit" bei Konflikten?
- Wie werden Duplikate heute erkannt (exakter Mail-Abgleich reicht meist,
  bei Namensvarianten braucht es ggf. KI-Unterstützung)?
- Sollen Zusammenführungen automatisch passieren oder erst nach Freigabe
  bei unklaren Fällen?

## Referenz-Workflow-Aufbau
1. Trigger je nach Quelle: `gmailTrigger`, `googleSheets` (Polling) oder
   `webhook` aus einem anderen System
2. `httpRequest` (Datenablage, op `select`) — bestehenden Kontakt per
   Mail/Telefon abgleichen
3. `if` — existiert bereits?
   - Nein: `httpRequest` (op `insert`) in Datenablage + Ziel-Systeme
   - Ja, abweichend: `chainLlm`/`code` — Felder zusammenführen (neuere/
     vollständigere Version gewinnt), bei Unsicherheit Human-in-the-Loop
4. `googleSheets`/weiteres Ziel-System — Änderung spiegeln
5. `httpRequest` (op `update`) — Datenablage als aktuellen Stand fortschreiben

## ROI
Bei mehreren hundert Kontakten und regelmäßiger manueller Pflege: ~4 h/Monat
gespart, plus deutlich weniger peinliche Doppelansprachen oder veraltete
Kundendaten.

## Grenzen
Automatisches Zusammenführen nur bei eindeutigen Treffern (z.B. identische
Mail-Adresse); bei unscharfen Duplikaten (ähnlicher Name, andere Mail)
lieber zur Prüfung vorlegen statt automatisch zu verschmelzen.

## Verwandte Use Cases
- Gesprächsnotizen (CRM-Updates aus Terminen speisen die Datenpflege)
- Berichte & Reports (saubere Daten sind Voraussetzung für verlässliche Reports)
