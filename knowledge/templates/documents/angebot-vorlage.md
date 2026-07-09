---
type: document_template_sample
kategorie: angebot
verwendet_von: angebot-autopilot
---

# Angebot — Beispielvorlage

Beispiel-Inhalt für eine Angebotsvorlage, wie sie über das Coach-Tool
`create_document_template` (siehe `lib/document-template.ts`,
`app/api/canvas-worker/create-template/route.ts`) am Canvas eines Nutzers hinterlegt und mit dem
`offer/draft`-Prompt (`lib/agent-prompts.ts`) gefüllt wird. Diese Datei selbst ist **keine**
Laufzeit-Ressource — Vorlagen werden pro Nutzer live im Coach-Gespräch gebaut
(`canvas.document_templates`, JSONB in `project_canvas`), nicht aus einer globalen Datei
geladen. Sie dient als Referenz/Startpunkt für Coach und Entwickler, wie eine sinnvolle
Angebotsvorlage für den Angebots-Autopiloten aussieht.

## Vorlage (mit Platzhaltern)

```
Angebot Nr. {{angebotsnummer}}
Datum: {{datum}}

Sehr geehrte(r) {{kundenname}},

vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:

Leistung: {{leistung}}
Umfang: {{umfang}}

Positionen:
{{positionen}}

Gesamtpreis: {{preis}} (zzgl. gesetzl. MwSt., sofern nicht anders angegeben)

Dieses Angebot ist gültig bis: {{gueltig_bis}}

Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.

Mit freundlichen Grüßen
{{absender}}
```

## Platzhalter

| Platzhalter | Bedeutung | Beispiel |
|---|---|---|
| `{{angebotsnummer}}` | fortlaufende oder generierte Angebotsnummer | `A-2026-0143` |
| `{{datum}}` | Erstellungsdatum des Angebots | `08.07.2026` |
| `{{kundenname}}` | Name des Kunden/Ansprechpartners | `Herr Mustermann` |
| `{{leistung}}` | Kurzbezeichnung der Hauptleistung | `Website-Relaunch` |
| `{{umfang}}` | 1-2 Sätze zum Leistungsumfang | `Redesign von 8 Unterseiten inkl. Content-Migration` |
| `{{positionen}}` | Liste der Einzelpositionen mit Preisen (aus der Preisliste) | `- Konzept: 400 €\n- Umsetzung: 1.200 €` |
| `{{preis}}` | Gesamtpreis | `1.600 €` |
| `{{gueltig_bis}}` | Gültigkeitsdatum des Angebots | `08.08.2026` |
| `{{absender}}` | Name/Firma des Absenders | `Team Musterfirma` |

## Beispiel (ausgefüllt, anonymisiert)

```
Angebot Nr. A-2026-0143
Datum: 08.07.2026

Sehr geehrte Frau Beispiel,

vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:

Leistung: Personal-Training-Paket
Umfang: 10 Einheiten à 60 Minuten, individuell terminierbar

Positionen:
- 10er-Karte Personal Training: 650 €

Gesamtpreis: 650 € (zzgl. gesetzl. MwSt., sofern nicht anders angegeben)

Dieses Angebot ist gültig bis: 08.08.2026

Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.

Mit freundlichen Grüßen
Team Musterfirma
```

## Zusammenspiel mit dem Angebots-Autopiloten

- Der `offer/draft`-Prompt bekommt die Preisliste als `{{preisliste}}`-Variable (aus der
  Datenablage, siehe `knowledge/templates/bausteine/datenablage-api.md`) und erzeugt daraus
  direkt einen fertigen Angebotstext (kein separates Platzhalter-Füllen als zweiten Schritt) —
  diese Vorlage hier ist Stil-/Struktur-Referenz, kein per-Platzhalter-Mechanismus im golden
  JSON-Workflow.
- Legt der Nutzer über `create_document_template` eine eigene Angebotsvorlage mit
  `role: 'output'` an, kann der Coach diese optional als System-Prompt-Zusatz (siehe
  `buildTemplateAiInstruction` in `lib/document-template.ts`) in den `offer/draft`-Aufruf
  einspeisen, damit exakt Ton und Format der Vorlage übernommen werden.
