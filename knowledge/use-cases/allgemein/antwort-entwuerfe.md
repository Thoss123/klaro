---
type: use_case
branche: allgemein
funktion: antworten
roi_stunden_pro_monat: 6
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung]
---

# Antwort-Entwürfe (wiederkehrende Anfragen im eigenen Ton)

## Wann einsetzen
Woran der Coach das erkennt: Der Nutzer sagt sinngemäß "ich beantworte
ständig dieselben drei, vier Fragen" oder "die Antwort ist eigentlich
immer ähnlich, ich tipp sie aber jedes Mal neu". Typisches Signal: hohe
Frequenz an strukturell ähnlichen Anfragen (Preise, Verfügbarkeit,
Öffnungszeiten, Ablauf), bei denen der Inhalt variiert, aber das Muster
gleich bleibt.

## Baustein-Kette
1. Wiederkehrende Anfrage kommt rein (Mail)
2. KI erkennt das Anliegen und formuliert eine Antwort aus dem
   Firmenwissen — im eigenen Ton (Persona), mit den passenden Fakten
3. Entwurf liegt bereit (im Postfach als Draft ODER als Freigabe-Anfrage)
4. Nutzer prüft kurz, passt ggf. an, sendet ab

## Benötigte Tools
- Gmail/Outlook: Eingang der Anfrage, Ablage/Versand des Entwurfs
- KI (läuft über Axantilo): Entwurf im Stil des Betriebs

## Typische Ist-Tools & Datenquellen
Wiederkehrende Fragen landen im normalen Postfach; die Antworten existieren
oft nur im Kopf des Inhabers oder als Copy-Paste-Textbausteine, die manuell
gesucht und angepasst werden.

## Benötigte Zugänge
- Mail-Postfach (Gmail/Outlook)
- KI-Schritte laufen über Axantilo — kein eigener KI-Zugang nötig

## Klärfragen für Phase 2
- Welche 3-5 wiederkehrenden Anfragetypen kommen am häufigsten vor?
- Soll der Entwurf direkt als Gmail-Draft liegen oder über einen
  Freigabe-Kanal (WhatsApp) bestätigt werden?
- Gibt es feste Formulierungen/Textbausteine, die die KI übernehmen soll?

## Referenz-Workflow-Aufbau
Dieser Use Case ist inhaltlich Teil des golden Templates
`knowledge/templates/workflows/email-triage-draft.md` (Kategorie
`support_faq`/`lead_inquiry`) — bei einem eigenständigen, schlankeren
Aufbau ohne volle Triage:

1. `gmailTrigger` (neue Mail, ggf. Label-Filter auf bekannte Absender/Betreffe)
2. `chainLlm` mit Prompt-Key `email/draft_support_faq` bzw. passendem Key —
   Firmenwissen + Persona werden serverseitig injiziert
3. `gmail` (message: create draft) — Entwurf im Postfach ablegen, ODER
   Human-in-the-Loop-Baustein für Freigabe per WhatsApp
   (`knowledge/templates/bausteine/human-in-the-loop.md`)

## ROI
Bei 20 wiederkehrenden Anfragen/Monat à 8-10 Min: ~3-4 h/Monat gespart bei
reinem Entwurfsmodus; mehr, wenn Standardfälle direkt automatisch raus
dürfen.

## Grenzen
Nur für wirklich wiederkehrende, faktenbasierte Anfragen geeignet — bei
Sonderfällen/Beschwerden lieber zurückhaltend antworten und auf
persönlichen Kontakt verweisen statt zu improvisieren.

## Verwandte Use Cases
- Posteingang-Triage (übergeordnete Sortierung, aus der dieser Use Case
  eine Kategorie vertieft)
- Lead-Qualifizierung (bei Anfragen von potenziellen Neukunden)
