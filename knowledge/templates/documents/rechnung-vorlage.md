---
type: document_template_sample
kategorie: rechnung
verwendet_von: rechnung-mahnwesen
---

# Rechnung — Beispielvorlage

Beispiel-Inhalt für eine Rechnungsvorlage als **Google Doc**. Der Nutzer legt ein Google Doc mit
diesen Platzhaltern an; seine Docs-Datei-ID (`{{INVOICE_DOC_TEMPLATE_ID}}`) wird dem
`rechnung-mahnwesen`-Template übergeben. Der Workflow kopiert die Vorlage pro Rechnung (Drive),
ersetzt die Platzhalter (Docs `replaceAll`) und exportiert sie als PDF. Diese Datei selbst ist
**keine** Laufzeit-Ressource — sie dient als Referenz/Startpunkt für Coach und Nutzer, wie die
Google-Docs-Vorlage aussehen soll. Die Positionen/Beträge kommen aus dem `invoice/draft`-Prompt
(`lib/agent-prompts.ts`).

## Vorlage (Platzhalter exakt so ins Google Doc schreiben)

```
RECHNUNG {{rechnungsnummer}}
Datum: {{datum}}

Rechnung an:
{{kundenname}}

Leistung: {{leistung}}

Positionen:
{{positionen}}

Gesamtbetrag: {{betrag}}
Zahlbar bis: {{faelligkeit}}

Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.
Vielen Dank für Ihren Auftrag.
```

## Hinweise
- Die Platzhalter müssen **wörtlich** (inkl. der doppelten geschweiften Klammern) im Doc stehen —
  der Docs-`replaceAll`-Schritt ersetzt genau diese Strings.
- Bank-/Steuerdaten (IBAN, USt-IdNr., Absender) gehören fest in die Vorlage, nicht in die
  Platzhalter — sie sind für alle Rechnungen gleich.
- `{{positionen}}` wird als mehrzeiliger Text ersetzt (eine Position pro Zeile).
