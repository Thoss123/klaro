---
type: use_case
branche: allgemein
funktion: leads
roi_stunden_pro_monat: 8
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung, google-sheets]
---

# Lead-Qualifizierung (Anfragen einordnen, beantworten, heiße priorisieren)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer beschreibt, dass "viele Anfragen
reinkommen, aber die meisten passen gar nicht" oder dass er "erstmal jede
Anfrage einzeln durchlesen muss, um zu sehen, ob sich das lohnt". Typisches
Signal: hohes Anfragevolumen, aber keine Vorsortierung nach Ernsthaftigkeit
— der Nutzer verliert Zeit mit unqualifizierten Anfragen, während heiße
Leads zwischen den anderen untergehen.

## Baustein-Kette
1. Neue Anfrage kommt rein (Mail/Formular)
2. KI bewertet die Anfrage anhand des Firmenwissens: passt der Bedarf zum
   Angebot? Kaufsignal erkennbar? Budget/Dringlichkeit?
3. Einstufung heiß/warm/kalt mit Begründung
4. Passende erste Antwort formulieren (heiß: sofort persönlich, kalt:
   höflich zurückhaltend oder Absage)
5. Heiße Leads priorisiert an den Inhaber melden (z.B. WhatsApp/Slack-Push)
6. Alle Leads mit Einstufung in die Liste eintragen

## Benötigte Tools
- Gmail/Outlook: Eingang der Anfragen, Versand der ersten Antwort
- KI (läuft über Axantilo): Qualifizierung + Antwortentwurf
- Google Sheets oder CRM: Lead-Liste mit Einstufung
- WhatsApp/Slack (zentral via Axantilo): Sofort-Hinweis bei heißen Leads

## Typische Ist-Tools & Datenquellen
Anfragen laufen meist über ein Kontaktformular oder direkt per Mail; die
Priorisierung passiert – falls überhaupt – nach Bauchgefühl beim
Durchscrollen des Postfachs.

## Benötigte Zugänge
- Mail-Postfach (Gmail/Outlook)
- WhatsApp/Slack für Sofort-Hinweise — zentral via Axantilo, kein Setup
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Was macht einen Lead "heiß" konkret (Budget genannt, Zeitdruck, bestimmte
  Leistung)? Am besten mit 2-3 echten Beispielen aus der Vergangenheit klären.
- Sollen kalte Leads automatisch eine Absage/Weiterverweisung bekommen oder
  unbeantwortet bleiben?
- Wohin soll der Sofort-Hinweis bei heißen Leads gehen (WhatsApp, Slack,
  Mail)?

## Referenz-Workflow-Aufbau
1. `gmailTrigger` (neue Anfrage) oder `formTrigger`
2. `informationExtractor` — Kerndaten der Anfrage strukturieren (Bedarf,
   Budget-Hinweise, Dringlichkeit)
3. `chainLlm` (Prompt-Key `tool/lead_qualify` aus `lib/agent-prompts.ts`) —
   Einstufung heiss/warm/kalt als JSON
4. `switch` — Verzweigung nach Einstufung
5. Heiß: `whatsApp`/`slack` — Sofort-Hinweis an Inhaber
6. Alle Zweige: `chainLlm` — passende erste Antwort formulieren
7. `gmail` — Antwort senden (ggf. hinter Human-in-the-Loop-Baustein bei
   Sonderfällen)
8. `googleSheets`/`httpRequest` (Datenablage) — Lead mit Einstufung
   eintragen

## ROI
Bei 60 Anfragen/Monat, von denen ~40% nicht passen: ~8 h/Monat gespart durch
wegfallendes manuelles Durchlesen und Vorsortieren. Wichtiger: heiße Leads
werden nicht mehr zwischen den anderen übersehen.

## Grenzen
Automatische Absagen an potenzielle Kunden sollten freundlich bleiben und
nie hart pauschal ablehnen — im Zweifel lieber "kalt" mit zurückhaltender
Antwort statt automatischer Ablehnung. Fehlklassifizierungen passieren;
Einstufung sollte im Zweifel eher zu warm als zu kalt ausfallen.

## Verwandte Use Cases
- Posteingang-Triage (übergeordnete Sortierung des gesamten Postfachs)
- Angebots-Autopilot (nächster Schritt nach einem heißen Lead)
