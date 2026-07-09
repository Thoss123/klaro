---
type: use_case
branche: allgemein
funktion: angebote
roi_stunden_pro_monat: 10
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung, google-sheets]
---

# Angebots-Autopilot (Anfrage rein, Angebot raus)

## Wann einsetzen
Woran der Coach das im Gespräch erkennt: Der Nutzer klagt, dass er nach jeder
Anfrage erstmal Kundendaten zusammensuchen, in der Preisliste nachschlagen
und das Angebot von Hand tippen muss — oft abends oder "wenn Zeit ist",
wodurch Anfragen tagelang liegen bleiben. Typische Formulierungen: "Ich
schreibe jedes Angebot einzeln", "das dauert ewig, bis der Kunde was
Schriftliches hat", "ich vergleiche das immer wieder mit der Preisliste".
Passt branchenübergreifend überall dort, wo auf eine Anfrage ein
individuelles, aber strukturell wiederkehrendes Angebot folgt.

## Baustein-Kette
1. Neue Anfrage kommt rein (Mail/Formular) → Kundendaten und gewünschte
   Leistung aus der Anfrage auslesen
2. Passende Preise/Leistungen aus der hinterlegten Preisliste ziehen
3. KI formuliert den Angebotstext aus Vorlage (Leistung, Umfang, Preis,
   Gültigkeit)
4. Entwurf zur Freigabe vorlegen (Human-in-the-Loop)
5. Nach OK: als PDF erzeugen und per Mail an den Kunden versenden
6. Anfrage/Angebot mit Status in die Liste eintragen

## Benötigte Tools
- Gmail/Outlook: Eingang der Anfrage, Versand des Angebots
- KI (läuft über Axantilo, kein eigener KI-Zugang nötig): Anfrage auslesen,
  Angebotstext formulieren
- Google Sheets oder Preisliste als Datenquelle: Leistungen/Preise
- Google Docs + Drive (PDF-Export): Angebotsvorlage mit Platzhaltern

## Typische Ist-Tools & Datenquellen
Anfragen kommen meist per Mail oder Kontaktformular; Preise liegen in einer
Tabelle, einem Dokument oder nur im Kopf des Inhabers. Bestehende Angebote
werden oft in Word/Google Docs oder direkt in der Mail getippt.

## Benötigte Zugänge
- Google-Konto (Docs/Drive) — läuft über Axantilos zentralen 3-Klick-OAuth,
  kein eigener OAuth-Client nötig
- Mail-Postfach (Gmail/Outlook) fürs Versenden
- KI-Schritte laufen über Axantilo selbst — kein eigener KI-Zugang

## Klärfragen für Phase 2
- Woher kommen die Preise/Leistungen (Tabelle, Dokument, im Kopf)? Müssen
  sie zuerst irgendwo strukturiert abgelegt werden?
- Gibt es eine bestehende Angebotsvorlage (Layout, Pflichttexte, AGB-Hinweis)?
- Soll jedes Angebot zur Freigabe, oder nur bei bestimmten Auftragsgrößen?
- Festpreis, Staffelpreise oder individuelle Kalkulation je Anfrage?

## Referenz-Workflow-Aufbau
1. `gmailTrigger` (neue Anfrage-Mail) oder `formTrigger`
2. `informationExtractor` — Kundendaten + gewünschte Leistung strukturieren
3. `httpRequest` — Preisliste/Leistungen aus Datenablage lesen (siehe
   `knowledge/templates/bausteine/datenablage-api.md`, op `select`)
4. `chainLlm` — Angebotstext aus Vorlage + Preisen formulieren
5. Human-in-the-Loop-Baustein (siehe
   `knowledge/templates/bausteine/human-in-the-loop.md`) — Freigabe vor Versand
6. `googleDocs` (createFromTemplate) → `googleDrive` (PDF-Export)
7. `gmail` — Angebot als PDF an den Kunden senden
8. `httpRequest` — Status in der Datenablage aktualisieren (op `insert`/`update`)

## ROI
Bei 10–15 Angeboten/Monat à 30–45 Min Zusammenstellen: ~8–10 h/Monat gespart.
Wichtiger: Angebot liegt in Minuten statt Tagen beim Kunden — bei schnell
beantworteten Anfragen ist die Abschlussquote spürbar höher.

## Grenzen
Individuelle Sonderkalkulationen (starke Abweichung vom Standardpreis)
gehören zur Freigabe, nicht in den Automatik-Modus. Rechtlich bindende
Klauseln (AGB, Gewährleistung) immer aus der Vorlage übernehmen, nie von
der KI frei formulieren lassen.

## Verwandte Use Cases
- Follow-up-Serie (Nachfassen, wenn das Angebot unbeantwortet bleibt)
- Lead-Qualifizierung (vor dem Angebot: passt die Anfrage überhaupt?)
