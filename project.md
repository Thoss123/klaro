# Klaro – Project Documentation (Stand: Mai 2026)

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

### 2.4 Der Industry Playbook Agent (n8n + NotebookLM)
- **Aufgabe:** Branchenwissen **vor** dem ersten Chat (Onboarding → n8n Webhook → `industry_playbooks`).
- **Umsetzung:** Sprint 3 in `roadmap.md`.

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
- **Automatisierungs-Engine:** n8n Community Edition (Self-Hosted auf Hetzner via Docker).

---

## 4. Datenmodell (Supabase Tabellen)

- `projects`: Zentrale Klammer für einen User-Workspace.
- `sessions`: Ein Chat-Gesprächsverlauf, speichert die Onboarding-Metadaten und den Status (`phase`, `memory`).
- `messages`: Chat-Historie (User/Assistant).
- `project_canvas`: Die Source of Truth für das rechte UI-Fenster. Speichert als JSONB die `pain_points`, `use_cases`, `workflows` und `documents`.
- `project_memory`: Aggregierte Zusammenfassungen abgeschlossener Phasen.
- `user_credentials` *(in Planung)*: Verschlüsselt gespeicherte API-Keys des Nutzers (AES-256-GCM).
- `workflows` *(in Planung)*: Verwaltung der in n8n deployten Workflows inkl. Ausführungsstatus.

---

## 5. Phasenablauf im Detail

### Onboarding (Adaptive Pfad-Logik)
Basierend auf den Antworten im Onboarding ändert der Coach seine Strategie:
- **Pfad A (Von Null):** Klassischer Diagnose-Flow.
- **Pfad B (Konkrete Ideen):** Überspringt Diagnose, geht direkt in die Analyse der mitgebrachten Idee und evaluiert den ROI.
- **Pfad C (Ist KI sinnvoll?):** Stark evaluativ, filtert unsinnige Use-Cases heraus.

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

> Für die genauen zeitlichen Milestones der Umsetzung, siehe **`roadmap.md`**.
