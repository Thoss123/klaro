---
type: use_case
branche: allgemein
funktion: posteingang
roi_stunden_pro_monat: 10
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung, whatsapp]
---

# Posteingang-Triage (Mails sortieren, Routine vorbeantworten, Spam filtern)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer klagt über einen überquellenden
Posteingang, "ich verbringe morgens erstmal eine Stunde nur mit Mails
durchgehen", oder "ich übersehe wichtige Mails zwischen ganz viel Kram
(Newsletter, Spam, Systemnachrichten)". Passt, sobald ein einziges Postfach
gemischt Kundenanfragen, Termine, Rechnungen, Support-Fragen und
Werbung/Spam empfängt und der Nutzer nicht mehr manuell vorsortiert.

## Baustein-Kette
Dieser Use Case ist der Kern des golden Templates
`knowledge/templates/workflows/email-triage-draft.md` (fertig gebaut,
live-getestet) — hier nur die Problem-Erkennung und der grobe Ablauf:

1. Neue Mail kommt rein → KI ordnet sie einer von 8 Kategorien zu
   (lead_inquiry, scheduling, support_faq, vendor_billing, system_alerts,
   newsletters, spam_marketing, other)
2. Je Kategorie ein eigener Weg: Antwort-Entwurf bei Kundenanliegen,
   Kurzinfo im Steuerkanal bei Eingangsrechnungen, stilles Archivieren bei
   Newsletter/Spam, Push nur bei dringenden System-Alerts
3. Entwürfe landen zur Freigabe, der Rest läuft automatisch durch

## Benötigte Tools
- Gmail/Outlook/IMAP: zentrale Quelle der Mails
- KI (läuft über Axantilo): Klassifizierung + Entwürfe
- WhatsApp (zentral via Axantilo): Freigabe-Kanal für Entwürfe

## Typische Ist-Tools & Datenquellen
Ein einziges Postfach für alles — Kundenanfragen, Termine, Lieferanten-
Rechnungen, Tool-Benachrichtigungen, Newsletter, Spam — ohne Filter/Regeln.

## Benötigte Zugänge
- Mail-Postfach verbinden (Gmail = zentraler 3-Klick-OAuth, Outlook/IMAP
  je nach Anbieter)
- WhatsApp für Freigaben — zentral via Axantilo, kein Setup
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Welcher Mail-Anbieter (Gmail/Outlook/IMAP)?
- Wer soll Entwürfe freigeben (Inhaber selbst oder eine andere Person)?
- Gibt es Mails, die NIE automatisch angefasst werden dürfen (z.B. rechtlich
  heikel)?

## Referenz-Workflow-Aufbau
Siehe `knowledge/templates/workflows/email-triage-draft.md` für den
vollständigen, live-getesteten Aufbau (Trigger → `textClassifier`/`chainLlm`
mit Prompt-Key `email/classify` → `switch` über 8 Kategorien → je Zweig
`chainLlm` mit passendem Draft-Prompt → Human-in-the-Loop-Baustein →
Freigabe-Kanal). Dieser Use Case beschreibt das Problem, die Lösung ist das
Template.

## ROI
Bei 100+ Mails/Woche und ~1 h/Tag manueller Vorsortierung: ~10 h/Monat
gespart. Wichtiger: nichts Wichtiges geht mehr zwischen Newsletter und Spam
unter.

## Grenzen
Automatisches Archivieren nur bei eindeutig unkritischen Kategorien
(Newsletter, Spam) — bei Unsicherheit lieber als Entwurf/Hinweis statt
stillem Wegsortieren.

## Verwandte Use Cases
- Antwort-Entwürfe (der Draft-Teil der Triage im Detail)
- Lead-Qualifizierung (Vertiefung für die Kategorie lead_inquiry)
