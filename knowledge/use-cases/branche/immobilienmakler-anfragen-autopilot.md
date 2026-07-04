---
type: use_case
branche: immobilienmakler
funktion: anfragen
roi_stunden_pro_monat: 15
aufwand_setup: 2
skill_level: niedrig
tools_benoetigt: [gmail, ki-textgenerierung, google-sheets]
---

# Anfragen-Autopilot (Portalanfragen sofort beantworten)

## Wann einsetzen
Wenn Portalanfragen (ImmoScout24, Immowelt, willhaben, Kleinanzeigen) per E-Mail eingehen und heute manuell — oft erst Stunden oder einen Tag später — beantwortet werden. Besonders wertvoll bei 20+ Anfragen pro Objekt.

## Baustein-Kette
Neue Portal-Mail erkennen → Objekt & Interessent aus der Mail auslesen → Qualifizierungs-Logik (ernsthaft vs. Standard) → passende Antwort mit Exposé-Link + Terminvorschlag erzeugen → als Entwurf zur Freigabe ODER direkt versenden → Interessent mit Status in Liste/CRM eintragen

## Benötigte Tools
- Gmail/Outlook: Eingang der Portal-Mails, Versand der Antworten
- KI: Anfrage auslesen, qualifizieren, Antwort im Stil des Maklers formulieren
- Google Sheets oder Makler-CRM (onOffice/Propstack/justimmo, falls anbindbar): Interessenten-Liste mit Status

## Varianten
- Einstieg: Alle Antworten als Entwurf zur Freigabe (Kontrolle behalten).
- Ausbau: Standardfälle automatisch, nur Sonderfälle zur Freigabe.
- Nacht-Modus: Nur außerhalb der Bürozeiten automatisch antworten.

## ROI
Bei 100 Anfragen/Monat à 8–10 Min Antwortzeit: ~15 h/Monat gespart. Wichtiger noch: Antwort in Minuten statt Stunden — die Abschlusswahrscheinlichkeit bei schnell beantworteten Anfragen ist deutlich höher.

## Grenzen
Bonitäts-/Selbstauskunft und GwG-Dokumente gehören NICHT in diesen Ablauf (Datenschutz). Portal-Postfächer ohne Mail-Weiterleitung sind schwerer anbindbar — dann Mail-Weiterleitung im Portal aktivieren.
