# Klaro – Project Documentation (Stand: Juni 2026)

Dieses Dokument ist die **Single Source of Truth** für die gesamte Architektur, das Datenmodell und die Vision von Klaro. Es ersetzt alte Spezifikationen und spiegelt den realen Code-Stand wider.

---

## 1. Was ist Klaro? (Die Vision)

**Klaro ist ein KI-Berater und Automatisierungs-Architekt für kleine und mittelständische Unternehmen (KMU).**
Das Problem: KMUs verbringen extrem viel Zeit mit wiederkehrenden manuellen Aufgaben (z.B. E-Mails kategorisieren, Daten von Tool A nach Tool B kopieren, CRM-Pflege), haben aber weder das technische Wissen, um sich Automatisierungen (via n8n oder Zapier) selbst aufzubauen, noch das Budget für teure externe Agenturen.

**Die Lösung:** 
Der Nutzer führt einen völlig natürlichen Chat mit dem KI-Berater "Klaro". 
Klaro führt den Nutzer durch 4 didaktische Phasen:
1. **Diagnose:** Wo geht am meisten Zeit verloren? (Pain Points identifizieren)
2. **Analyse:** Welche Tools nutzt das Unternehmen bereits? (Use Cases & Tools)
3. **Planung:** Entwurf eines tool-neutralen Automatisierungs-Workflows (Canvas UI)
4. **Umsetzung (Deployment):** Klaro baut den Workflow vollautomatisch im Hintergrund in einer n8n-Instanz auf und aktiviert ihn.

**Der Clou:** Der Nutzer muss **niemals** den Code oder das komplexe Interface von n8n berühren. Klaro kümmert sich um das gesamte Deployment und Management der Workflows, basierend auf dem Gespräch.

---

## 2. Multi-Agenten Architektur (Mistral-First)

Um Kosten zu senken und die Intelligenz zu maximieren, läuft Klaro **nicht** als monolithischer Bot, sondern als ein Team von spezialisierten KI-Agenten, die asynchron im Hintergrund arbeiten. Alle Agenten nutzen **Mistral** Modelle.

### 2.1 Der Haupt-Coach (Mistral Large)
- **Aufgabe:** Einfühlsame, zielgerichtete Gesprächsführung mit dem Nutzer.
- **Rolle:** Ein Berater, der gezielt Fragen stellt und Lösungen erarbeitet.
- **Modell:** `mistral-large-latest` (teuer, aber hochintelligent im Text).
- **Route:** `/api/chat`

### 2.2 Der Blob Builder (Mistral Small)
- **Aufgabe:** Strukturiert Daten. Nimmt den rohen Chatverlauf und extrahiert daraus das JSON für das UI-Canvas (Pain Points, Workflows).
- **Rolle:** Ein unsichtbarer Daten-Extraktor. 
- **Modell:** `mistral-small-latest` (sehr günstig, extrem schnell in JSON-Generierung).
- **Route:** `/api/canvas-worker`
- **Trigger:** Wird aufgerufen, wenn der Coach das `<trigger_canvas_update>` Tag im Chat sendet. Das Frontend holt sich die Ergebnisse über Supabase Realtime ab.

### 2.3 Der Memory Guardian (Mistral Small)
- **Aufgabe:** Führt das Langzeitgedächtnis. Trennt den Chat in `[CORE FACTS]` (harte Fakten über das Unternehmen) und `[LATEST CONTEXT]` (Smalltalk).
- **Rolle:** Verhindert "Memory Pollution" (das Verwässern von Kernzielen durch irrelevantes Geplauder).
- **Route:** `/api/memory-update`

### 2.4 Wissensdatenbank-Zugriff (RAG-Tool `search_knowledge`)
- **Ersetzt** den früher geplanten Industry-Playbook-Agent (kein n8n/NotebookLM-Pre-Research mehr).
- **Aufgabe:** Der Haupt-Coach durchsucht bei Bedarf die zentrale RAG-Wissensdatenbank (§3.4) über das Tool `search_knowledge` — für UI-How-tos, Tool-Setup, abgedeckte Use-Cases und vor dem Workflow-Bauen.
- **Selektiv:** Der Coach bewertet die Treffer selbst (Relevanz-Score + `branche`-Metadaten) und ignoriert Unpassendes. Kein automatisches Reinpressen von Kontext mehr.
- **Code:** `lib/ai-tools.ts` (Tool-Definition), Handler in `app/api/chat/route.ts`, Regel 10 in `KLARO_SHARED_RULES` (`lib/claude.ts`).

### 2.5 Topic Research Agent (Mistral Small) *(Sprint 3)*
- **Aufgabe:** Session-spezifische Recherche für Phase Plan (z. B. YouTube/Reels, Trends) — Output `ResearchBrief` für Canvas-Worker.
- **Route:** `lib/agents/topic-research.ts` via `lib/agent-orchestration.ts`.

### 2.6 Supervisor Agent (Mistral Small) *(Sprint 3)*
- **Aufgabe:** Thema-Treue, ein Pain Point pro Update, Merge statt Duplikat-Workflow — Gate vor Canvas-Worker.

### 2.7 Workflow QA Agent / Critic (Mistral Small) *(Sprint 3)*
- **Aufgabe:** Schritt-Reihenfolge, Automatisierungsgrad, Human-in-the-loop nur an den richtigen Stellen, Titel 3–5 Wörter.
- **Route:** `lib/agents/workflow-qa.ts` (ggf. zusammen mit Supervisor ein Call).

### 2.8 Phase Summarizer (Mistral Small)
- **Aufgabe:** Phasen-Zusammenfassung bei Übergang.
- **Route:** `/api/summarize`

> **Orchestrierung:** Alle Hintergrund-Agenten (2.2–2.7) laufen in **Sprint 3** über `runCanvasPipeline()` — Details und QA in **`roadmap.md`**.

### 2.9 Coach Advisor (Backlog, optional v1.1+)
- **Aufgabe:** Proaktives Session-Briefing für den Haupt-Coach (aktives Thema, nächster Schritt) — **nicht** Canvas-Gate (das ist Supervisor) und **nicht** sichtbar für den Nutzer.
- **Siehe:** Backlog-Abschnitt in **`roadmap.md`**.

---

## 3. Tech Stack & Infrastruktur

- **Frontend:** Next.js 14 App Router, React, Tailwind CSS, Framer-Motion.
- **Backend:** Next.js API Routes.
- **Datenbank & Auth:** Supabase (PostgreSQL), Magic-Link / OAuth.
- **Echtzeit-Updates:** Supabase Realtime Channels (für Canvas-Updates).
- **KI-Provider:** `@mistralai/mistralai` SDK.
- **RAG / Embeddings:** Supabase `pgvector` + Mistral `mistral-embed` (1024-dim).
- **Automatisierungs-Engine:** n8n Community Edition (Self-Hosted auf **Hostinger VPS** via Docker) — **eine geteilte Instanz für alle Nutzer**, isoliert über n8n Projects + `company_id`.

### 3.1 Zentrale Infrastruktur (Shared Services)

**Prinzip:** Nutzer richten **keine** eigenen Cloud-Setups ein. Klaro betreibt die Infrastruktur zentral; der Nutzer klickt im Zweifel nur „Erlauben".

- **Zentrale OAuth-Apps:** Eine Klaro-OAuth-App pro Anbieter für Google (Gmail, Calendar, Drive, Sheets) und Microsoft (Outlook, Teams, OneDrive). Der Nutzer autorisiert per Klick — **kein** Google-Cloud-Console-Setup, keine eigenen Client-IDs.
- **Twilio:** Eine zentrale Nummer für WhatsApp + SMS, von allen Nutzern geteilt.
- **Resend:** Eine zentrale Domain für System-Mails (`notifications@klaro.ai`).
- **Mistral (Free Tier):** Coach, Memory-Updates und Embeddings laufen zentral, solange die Rate Limits reichen.
- **n8n CE (Hostinger VPS):** Kostenlos, eine geteilte Instanz; Mandantentrennung über n8n Projects + `company_id`.

### 3.2 Webhook-Routing (zentraler Router)

Kein manuelles Webhook-Setup für Nutzer. Klaro betreibt einen zentralen Router:

- Jede Company erhält eine Sub-URL: `/webhook/{company_id}/{event_type}`.
- Ein zentraler n8n-Router leitet eingehende Events automatisch an den richtigen Nutzer-Workflow weiter.
- Webhook-URLs werden beim Deployment automatisch generiert — der Nutzer sieht davon nichts.

### 3.3 Workflow-Builder mit Node-Map

Die KI sieht **nie** n8n-Node-Typen, sondern nur logische Baustein-Namen (`email_senden`, `crm_updaten`, …).

- Eine **Node-Map** (`node_map.json` im Root) übersetzt *Baustein + Tool → exaktes n8n-Node-JSON*.
- Das eliminiert KI-Halluzinationen bei der Workflow-Generierung (die KI kann keine falschen Node-Typen/Parameter erfinden).

### 3.4 RAG Knowledge Base (gebaut)

Wissensdatenbank für den Coach mit **atomaren Dateien**: Jede Datei = eine vollständige, abgeschlossene Wissenseinheit (kein Token-Split). Jede Datei wird als Ganzes embedded und indexiert.

- **Ordner** (`/knowledge`): `use-cases/` (branche & funktion), `tools/`, `templates/bausteine/`, `templates/workflows/`, `branchen/`, `ui-guides/`.
- **Speicher:** Supabase-Tabelle `knowledge_base` (`pgvector`, `vector(1024)`), `source_type` aus dem Ordnerpfad abgeleitet. **Global / admin-kuratiert** (kein `company_id`-Scoping): öffentlich lesbar, Schreiben nur für eingeloggte Admins (RLS). RPC `search_knowledge` mit Phase-Filter.
- **Code:** `lib/rag.ts` (Retrieval, phasenabhängig), `lib/knowledge-index.ts` (Server-Reindex), `scripts/index-knowledge.mjs` (CLI: `npm run index-knowledge`, braucht `SUPABASE_SERVICE_ROLE_KEY`).
- **Admin-Interface:** `/admin/knowledge` (Übersicht, Reindex pro Sektion, Such-Test, Löschen).
- **Coach-Integration:** `app/api/chat/route.ts` injiziert relevantes Wissen phasenabhängig in den System-Prompt.

---

## 4. Datenmodell (Supabase Tabellen)

- `projects`: Zentrale Klammer für einen User-Workspace.
- `sessions`: Ein Chat-Gesprächsverlauf, speichert die Onboarding-Metadaten und den Status (`phase`, `memory`).
- `messages`: Chat-Historie (User/Assistant).
- `project_canvas`: Die Source of Truth für das rechte UI-Fenster. Speichert als JSONB die `pain_points`, `use_cases`, `workflows` und `documents`.
- `project_memory`: Aggregierte Zusammenfassungen abgeschlossener Phasen.
- `user_credentials`: Verschlüsselt gespeicherte API-Keys des Nutzers (AES-256-GCM). _Tabelle deployed (RLS aktiv)._
- `workflows`: Verwaltung der in n8n deployten Workflows inkl. Ausführungsstatus. _Tabelle deployed (RLS aktiv)._
- `knowledge_base`: RAG-Wissensdatenbank (`pgvector`, atomare Dateien, global/admin-kuratiert). _Deployed inkl. `pgvector`-Extension + RPC `search_knowledge`._
- `events` *(Post-MVP, Data Layer)*: Loggt jede Workflow-Execution. Basis für spätere KI-Insights & Selbstverbesserung (siehe Abschnitt 6).

---

## 5. Phasenablauf im Detail

### Onboarding (Adaptive Pfad-Logik)
Basierend auf den Antworten im Onboarding ändert der Coach seine Strategie:
Vier Pfade je nach Onboarding-Ziel (`{{ziel}}`-Variable):
- **Pfad A (Von Null):** Klassischer Diagnose-Flow.
- **Pfad B (Konkrete Ideen):** Überspringt Diagnose, geht direkt in die Analyse der mitgebrachten Idee und evaluiert den ROI.
- **Pfad C (Ist KI sinnvoll?):** Stark evaluativ, filtert unsinnige Use-Cases heraus.
- **Pfad D (Briefing-Export):** Diagnose normal, aber am Ende wird **kein** Workflow deployed, sondern ein architektonisches Briefing/Konzept zur Übergabe an die IT-Abteilung oder Agentur erzeugt.

> Status: Die Pfad-Logik ist im Coach-Prompt angelegt; die vollständige Ausdifferenzierung der vier Pfade (inkl. Pfad-D-Export) ist im Sprint „Qualität" eingeplant (siehe `roadmap.md`).

### Phase 1: Diagnose
Klärt ab, wo die größten Engpässe und Zeitfresser im Unternehmen liegen. Speichert dies als "Pain Points".

### Phase 2: Analyse
Fragt spezifisch für jeden gefundenen Pain Point ab, **welche Tools der User heute nutzt**. Klaro drängt dem Nutzer hier keine internen Tools wie n8n auf, sondern lernt nur die Tool-Landschaft des Kunden kennen.

### Phase 3: Planung
Entwirft einen didaktischen, **tool-neutralen** Workflow (Trigger → KI → Entscheidung → Output). Ziel: Der Nutzer muss den Wert und die Logik der Automatisierung verstehen, bevor sie gebaut wird. Sichtbar in der Workflow-UI als Step-Karten.

### Phase 4: Umsetzung (Deployment)
Das Herzstück der Plattform.
1. **Tool-Mapping:** Klaro mappt die neutralen Schritte auf echte n8n-Nodes.
2. **Credential Collection:** Fragt über Popups die nötigen Logins (z.B. Gmail, Slack) ab und speichert sie verschlüsselt.
3. **Deployment:** Generiert das JSON für n8n und pushed es über `/api/n8n/*` Routen heimlich in die n8n Instanz.
4. **Test & Live:** Führt Test-Trigger aus und schaltet den Workflow auf "Active".

---

## 6. Data Layer & Selbstverbesserung (Post-MVP)

Während die Phasen laufen, baut Klaro **automatisch im Hintergrund** einen Data Layer auf — kein manueller Schritt für den Nutzer.

- **`events`-Tabelle:** Jede Workflow-Execution wird geloggt (Basis für Auswertung).
- **Vier Reifestufen:**
  1. **Einzelworkflows** — isolierte Automatisierungen laufen & werden geloggt.
  2. **Vernetzte Workflows** — Workflows greifen ineinander, gemeinsamer Daten-Kontext.
  3. **KI-Intelligenz** — Insights aus den Event-Daten (Muster, Engpässe, ROI-Auswertung).
  4. **Selbstverbesserung** — Klaro schlägt auf Basis der Daten eigenständig Optimierungen vor.

## 7. Dashboard Builder (Post-MVP)

Ein Dashboard wird **automatisch** aus den deployten Workflows + dem Data Layer generiert — **nicht** manuell konfiguriert. Kein MVP-Feature; gemerkt für nach dem MVP.

---

## 8. Aktueller Build-Status (Juni 2026)

- **Phase 1 (Diagnose) Chat + Canvas:** funktioniert.
- **Onboarding:** funktioniert (inkl. Pfad-Variable `{{ziel}}`).
- **Supabase-Schema:** deployed, **inkl. `pgvector`**.
- **RAG-Struktur:** Knowledge-Ordner `/knowledge` + `knowledge_base`-Tabelle + Indexierung + Admin-UI angelegt und getestet.
- **n8n-Anbindung:** Live-Instanz auf Hostinger VPS erreichbar; Deploy-/Execution-Routen vorhanden.

---

> Für die genauen zeitlichen Milestones der Umsetzung, siehe **`roadmap.md`**.
