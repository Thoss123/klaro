## Kuratierte Tool-Liste

Verwende ausschließlich die Tools aus der folgenden Liste. Empfehle keine Tools die nicht aufgeführt sind. Halte dich an die Entscheidungsregeln pro Kategorie.

# Klaro — Kuratierte Tool-Liste für Phase 2

## Entscheidungsprinzipien

1. **DSGVO first** — EU-Tools bevorzugen, US-Tools nur wenn explizit akzeptiert
2. **Bestehendes nicht ersetzen** — immer in existierende Systeme integrieren, nie ein neues System aufzwingen
3. **Skill-Level matchen** — kein Code-Tool für jemanden ohne technische Erfahrung
4. **Kosten transparent** — immer Setup + laufende Kosten + Wartungsaufwand nennen

---

## Kategorie 1 — Automation & Orchestrierung

### n8n ⭐ Standard-Empfehlung
- **Wann:** immer wenn Automation zwischen Systemen gefragt ist und technische Grundkenntnisse vorhanden
- **Vorteile:** self-hostable, EU-DSGVO-konform, sehr mächtig, einmalige Lizenz möglich, du kennst es
- **Nachteile:** braucht VPS wenn online, Setup-Aufwand höher als Make/Zapier
- **Kosten:** self-hosted kostenlos + VPS ~€5–15/Monat, Cloud ab €20/Monat
- **Empfehlen wenn:** wer_setzt_um = technisch, Daten sensibel, langfristige Lösung gewünscht

### Make (ehemals Integromat)
- **Wann:** no-code Automation, Nutzer will selbst verwalten ohne Entwickler
- **Vorteile:** sehr visual, einfach zu bedienen, EU-Server verfügbar
- **Nachteile:** wird teuer bei hohem Volumen, weniger flexibel als n8n
- **Kosten:** kostenlos bis 1.000 Operationen/Monat, dann ab €9/Monat
- **Empfehlen wenn:** wer_setzt_um = nicht-technisch, Volumen überschaubar

### Zapier
- **Wann:** nur wenn Nutzer es bereits kennt oder spezifisch danach fragt
- **Vorteile:** größte App-Bibliothek, sehr einfach
- **Nachteile:** US-Server, teuer, DSGVO-kritisch bei sensiblen Daten
- **Kosten:** ab €19/Monat für sinnvolle Nutzung
- **Empfehlen wenn:** keine DSGVO-Bedenken, Nutzer bereits vertraut

---

## Kategorie 2 — KI-Modelle / APIs

### Mistral AI ⭐ Standard-Empfehlung für DACH
- **Wann:** immer wenn Datenschutz wichtig, generell als Default
- **Vorteile:** französisch, EU-Server, DSGVO by default, günstig, Qualität nahe Claude
- **Modelle:** mistral-large (komplex), mistral-small (einfach/günstig)
- **Kosten:** ~€2/1M Input-Token, ~€6/1M Output-Token
- **Empfehlen wenn:** branche = Gesundheit/Finanzen/Recht, DSGVO-kritische Daten

### Claude API (Anthropic)
- **Wann:** höchste Qualität gewünscht, komplexe Reasoning-Tasks
- **Vorteile:** beste Qualität für nuancierte Aufgaben, guter DPA verfügbar
- **Nachteile:** US-Unternehmen, teurer als Mistral
- **Kosten:** ~€3/1M Input, ~€15/1M Output (Sonnet)
- **Empfehlen wenn:** EU-Cloud akzeptiert, Qualität > Preis

### Gemini API (Google)
- **Wann:** Budget sehr knapp, Google-Ecosystem bereits vorhanden
- **Vorteile:** günstig, Flash-Modell sehr schnell
- **Nachteile:** Google als Datentreuhänder problematisch für viele DACH-KMUs
- **Kosten:** Flash kostenlos bis Limit, dann sehr günstig
- **Empfehlen wenn:** kein Datenschutz-Bedenken, Prototyping/Testing

---

## Kategorie 3 — Recherche & Lead Intelligence

### Apollo.io
- **Wann:** B2B Lead-Recherche automatisieren
- **Vorteile:** große Datenbank, API verfügbar, gut mit n8n integrierbar
- **Nachteile:** US-Unternehmen, Datenschutz beachten
- **Kosten:** kostenlos bis 50 Credits/Monat, dann ab €49/Monat
- **Empfehlen wenn:** B2B-Outreach, Volumen >50 Leads/Monat

### Clay
- **Wann:** komplexes Lead-Enrichment mit mehreren Datenquellen
- **Vorteile:** kombiniert 50+ Datenquellen, KI-gestützte Personalisierung
- **Nachteile:** teuer, Lernkurve, US
- **Kosten:** ab €149/Monat sinnvoll
- **Empfehlen wenn:** Sales-Team vorhanden, Outbound-Volumen hoch

### Hunter.io
- **Wann:** E-Mail-Adressen von Unternehmen finden
- **Vorteile:** einfach, API vorhanden, europäisches Unternehmen
- **Kosten:** kostenlos bis 25 Suchen/Monat, dann ab €34/Monat
- **Empfehlen wenn:** kleine Volumen, einfache E-Mail-Suche

### Phantombuster
- **Wann:** LinkedIn-Daten scrapen, Social-Media-Automation
- **Vorteile:** viele vorgefertigte Workflows
- **Nachteile:** LinkedIn-ToS Grauzone, US
- **Kosten:** ab €56/Monat
- **Empfehlen wenn:** explizit LinkedIn-Automation gewünscht, Risiko bekannt

### Exa.ai
- **Wann:** semantische Web-Recherche per API
- **Vorteile:** findet thematisch passende Inhalte statt keyword-basiert, gut für Whitepaper/Publikations-Suche
- **Kosten:** kostenlos bis 1.000 Suchen/Monat
- **Empfehlen wenn:** Publikations-Scanner, Marktbeobachtung, Recherche-Automation

### Firecrawl
- **Wann:** Webseiten strukturiert scrapen für KI-Input
- **Vorteile:** gibt sauberes Markdown zurück, einfache API
- **Kosten:** kostenlos bis 500 Seiten/Monat
- **Empfehlen wenn:** Wettbewerber-Monitoring, Preis-Tracking, Content-Extraktion

### Perplexity API
- **Wann:** KI-gestützte Web-Recherche in Automationen einbinden
- **Vorteile:** liefert recherchierte Antworten mit Quellen
- **Kosten:** günstig per Token
- **Empfehlen wenn:** automatisierte Marktberichte, News-Monitoring

---

## Kategorie 4 — Wissensdatenbanken & Dokumenten-KI

### Notion AI
- **Wann:** Unternehmen nutzt bereits Notion
- **Vorteile:** nahtlose Integration, einfach zu bedienen
- **Nachteile:** US-Server, Qualität begrenzt
- **Empfehlen wenn:** Notion bereits im Einsatz

### n8n + Supabase + Mistral (RAG-Stack) ⭐
- **Wann:** interne Wissensdatenbank aus bestehenden Dokumenten
- **Vorteile:** vollständig EU, selbst gehostet, flexibel, DSGVO-konform
- **Nachteile:** Setup-Aufwand 3–5 Tage
- **Empfehlen wenn:** sensible interne Dokumente, langfristige Lösung

### Guru / Tettra / Confluence
- **Wann:** Team-Wiki ohne technischen Aufwand
- **Empfehlen wenn:** kein technischer Umsetzer vorhanden, reine Wissensdokumentation

---

## Kategorie 5 — Dokumente & Berichte

### Docupilot / Carbone
- **Wann:** automatische Dokument-Generierung (Angebote, Verträge, Berichte)
- **Vorteile:** Templates, API, europäische Optionen verfügbar
- **Empfehlen wenn:** hoher Angebots- oder Vertrags-Volumen

### n8n + HTML-to-PDF
- **Wann:** einfache Dokument-Automation selbst gebaut
- **Empfehlen wenn:** technischer Umsetzer vorhanden, Flexibilität wichtig

---

## Hosting & Infrastruktur

### VPS für n8n (wenn online sein muss)

**Hetzner Cloud ⭐ Standard-Empfehlung**
- Deutsches Unternehmen, Server in Deutschland/Finnland
- DSGVO by default, ISO 27001 zertifiziert
- CX22: 2 vCPU, 4GB RAM → reicht für n8n + leichte Workloads → **€4.15/Monat**
- CX32: 4 vCPU, 8GB RAM → für mehrere n8n-Workflows + Datenbank → **€8.21/Monat**
- Setup: Docker + n8n in 30 Minuten mit Standard-Anleitung

**Contabo**
- Deutsches Unternehmen, sehr günstig
- VPS S: 4 vCPU, 8GB RAM → **€6.99/Monat**
- Nachteil: Support langsamer als Hetzner

**Railway**
- Einfaches Deployment ohne Server-Verwaltung
- Gut für schnellen Start ohne DevOps-Aufwand
- Ab €5/Monat, US-basiert
- Empfehlen wenn: schnell starten, keine DSGVO-Bedenken

---

## Datenbank-Alternativen zu Supabase

⚠️ **Supabase-Problem beachten:** Free Tier pausiert nach 7 Tagen Inaktivität automatisch. Für Produktiv-Einsatz ungeeignet ohne Pro-Plan ($25/Monat). Bei eigenen Projekten/Klaro selbst: entweder Supabase Pro oder Alternative wählen.

### Neon ⭐ Beste kostenlose Alternative
- Postgres wie Supabase, pausiert NICHT bei Inaktivität
- Kostenlos bis 0.5GB, EU-Region verfügbar
- API und SDK ähnlich wie Supabase → einfache Migration
- Kein Auth-System eingebaut (separates Tool nötig)

### Supabase Pro
- $25/Monat, kein Pausing, volle Features
- Sinnvoll wenn Auth + DB + Storage in einem

### Self-hosted Postgres auf Hetzner
- Vollständige Kontrolle, DSGVO-sicher
- Setup-Aufwand: ~2 Stunden
- Kosten: nur VPS (~€4–8/Monat)
- Empfehlen wenn: technischer Umsetzer vorhanden, langfristige Lösung

### PocketBase
- Leichtgewichtige Alternative zu Supabase
- Single binary, einfach self-hosted
- Gut für kleinere Projekte
- Kein managed Service verfügbar

---

## Tool-Entscheidungsmatrix für den Coach

| Situation | Empfehlung |
|-----------|-----------|
| Automation, technisch, DSGVO-kritisch | n8n auf Hetzner VPS |
| Automation, nicht-technisch | Make |
| KI-Text, DSGVO-kritisch | Mistral API |
| KI-Text, Qualität wichtig | Claude API |
| Lead-Recherche B2B | Apollo + n8n |
| Wissensdatenbank, sensibel | n8n + Supabase + Mistral |
| Wissensdatenbank, einfach | Notion AI |
| Dokument-Automation | Docupilot oder n8n |
| Web-Recherche automatisiert | Exa.ai oder Firecrawl + n8n |
| Datenbank für eigene Apps | Neon (kostenlos) oder Supabase Pro |
