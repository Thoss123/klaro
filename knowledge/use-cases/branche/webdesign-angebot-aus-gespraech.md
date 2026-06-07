---
type: use_case
branche: webdesign
funktion: outreach
roi_stunden_pro_monat: 8
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, openai, google-docs]
---

# Angebot aus Gesprächsnotiz generieren

## Wann einsetzen
Nach einem Erstgespräch mit einem potenziellen Kunden. Statt das Angebot manuell aus deinen Notizen zu tippen, diktierst oder pastest du die Gesprächsnotiz und bekommst einen fertigen Angebotsentwurf.

## Baustein-Kette
Notiz erfassen → KI strukturiert Leistung & Umfang → Angebotstext aus Vorlage füllen → Entwurf zur Freigabe vorlegen → nach OK als PDF per Mail an Kunden

## Benötigte Tools
- Gmail: Versand des fertigen Angebots
- OpenAI/Claude: Notiz in strukturiertes Angebot umwandeln
- Google Docs: Angebotsvorlage mit Platzhaltern

## Typische Variablen
- KUNDEN_NAME: Name des Ansprechpartners (z. B. „Frau Müller")
- LEISTUNGEN: aus dem Gespräch extrahierte Positionen
- PREIS: kalkulierter Festpreis oder Tagessatz × Tage

## ROI
Pro Angebot ~2,5 h gespart. Bei 3–4 Angeboten/Monat = ~8 h/Monat. Bei 80 €/h Opportunitätskosten ~640 €/Monat.

## Häufige Anpassungen
- Festpreis vs. Stundenkontingent je nach Projektart.
- Mehrsprachige Angebote bei internationalen Kunden.
- Optionaler Human-in-the-Loop-Schritt (siehe templates/bausteine/human-in-the-loop.md) vor dem Versand.

## Verwandte Use Cases
- Lead-Follow-up nach 3 Tagen ohne Antwort
- Onboarding-Fragebogen nach Auftragszusage
