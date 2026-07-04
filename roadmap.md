# Axantilo – Master Project Roadmap (v1.3 Chronologisch)

Dieses Dokument ist die **Single Source of Truth** für alle anstehenden Entwicklungs-, Test- und Business-Schritte bis zum offiziellen Launch der v1.0.

> [!IMPORTANT]
> Jeder Sprint endet mit einem internen QA-Test. Sprint 2 (n8n API) ist Voraussetzung für Sprint 3 (Agent-Orchestrierung), weil Playbook und spätere Tool-Runs über n8n laufen.

---

## Agent-Übersicht (Zielbild v1)

| Agent | Modell | Route / Trigger | Sichtbar für Nutzer? |
|-------|--------|-----------------|----------------------|
| **Haupt-Coach** | Mistral Large | `/api/chat` | Ja |
| **Memory Guardian** | Mistral Small | `/api/memory-update` (nach Chat-Turn) | Nein |
| **Industry Playbook** | n8n + NotebookLM → Mistral Small (optional) | Onboarding-Ende → n8n Webhook | Nein |
| **Topic Research** | Mistral Small + Tools | Orchestration-Pipeline, Phase `plan` | Nein |
| **Supervisor** | Mistral Small | Orchestration-Pipeline vor Canvas-Worker | Nein |
| **Workflow QA (Critic)** | Mistral Small | Orchestration-Pipeline vor Canvas-Worker | Nein |
| **Canvas Worker (Blob Builder)** | Mistral Small | `/api/canvas-worker` | Nein |
| **Phase Summarizer** | Mistral Small | `/api/summarize` (Phasenwechsel) | Nein |
| **Coach Advisor** *(Backlog, siehe unten)* | Mistral Small | alle 3–5 Coach-Turns, nur intern | Nein |

**Kein eigener LLM-Agent (Services):** `lib/n8n.ts`, `lib/workflow-generator.ts`, `/api/n8n/*` — Ausführung & Deploy, nicht Beratung.

**Orchestrierungs-Pipeline (nach Sprint 3):**

```text
Coach: <trigger_canvas_update>
    → POST /api/canvas-worker
        → runCanvasPipeline()  [lib/agent-orchestration.ts]
            1. Topic Research (nur phase=plan, wenn Thema Recherche braucht)
            2. Supervisor (Thema, 1 Pain Point, Merge vs. neu)
            3. Workflow QA (Reihenfolge, Automatisierung, Human-Gates)
            4. Canvas Worker (JSON-Extraktion, bestehende Prompts)
            5. normalizeCanvasData + merge workflows
        → Supabase project_canvas (Realtime → UI)
```

---

## Sprint 1: Performance & Basis-KI-Wechsel (Erledigt)

- `[x]` **Mistral-Only Engine:** Chat = Large, Background = Small.
- `[x]` **Blob Builder entkoppelt:** Canvas-Worker async, UI via Supabase Realtime.

---

## RAG Knowledge Base (Erledigt – Juni 2026)

**Ziel:** Der Coach beantwortet Fragen aus einer kuratierten Wissensdatenbank statt nur aus dem Modellwissen. **Atomare Dateien** (1 Datei = 1 vollständige Wissenseinheit, kein Token-Split).

- `[x]` **Ordnerstruktur** `/knowledge`: `use-cases/`, `tools/`, `templates/bausteine/`, `templates/workflows/`, `branchen/`, `ui-guides/`.
- `[x]` **Supabase:** `pgvector`-Extension + Tabelle `knowledge_base` (`vector(1024)`) + RPC `search_knowledge` (Phase-Filter). **Global/admin-kuratiert** (kein `company_id`), RLS: public read / authenticated write.
- `[x]` **`lib/rag.ts`:** phasenabhängiges Retrieval; **`lib/knowledge-index.ts`** + **`scripts/index-knowledge.mjs`** (`npm run index-knowledge`, braucht `SUPABASE_SERVICE_ROLE_KEY`).
- `[x]` **Admin-Interface** `/admin/knowledge`: Übersicht, Reindex pro Sektion, Such-Test, Löschen.
- `[x]` **Coach-Integration:** `app/api/chat/route.ts` injiziert relevantes Wissen phasenabhängig.
- `[x]` **Test:** 6 Starter-Dateien (eine pro `source_type`) indexiert; Retrieval über mehrere Phase/Query-Kombinationen verifiziert.

---

## Zentrale Infrastruktur & Shared Services (Juni 2026)

**Entscheidung:** Nutzer richten **keine** eigenen Cloud-Setups ein — Axantilo betreibt alles zentral. Details in `project.md` §3.1–3.3.

- `[x]` **Zentrale OAuth-Apps:** Google OAuth-App (Gmail, Calendar, Drive, Sheets, YouTube) eingerichtet; Callback-URL in n8n konfiguriert; Nutzer klickt nur „Verbinden → Konto wählen → Bestätigen". Docs in `knowledge/node-map/google-oauth-3klick.md`.
- `[x]` **Twilio:** zentraler Account eingerichtet; Nummer für SMS + WhatsApp-Sandbox geteilt; n8n-Credential-ID via `N8N_CREDENTIAL_TWILIO`; kein User-Setup. Docs in `knowledge/node-map/twilio-sms-whatsapp.md`.
- `[x]` **Resend:** Domain `axantilo.com` verifiziert, zentrale SMTP-Credential in n8n via `N8N_CREDENTIAL_SMTP`; alle System-Mails von `hello@axantilo.com` ohne User-Setup. Docs in `knowledge/node-map/resend-email.md`.
- `[x]` **Mistral (Free Tier):** Coach, Memory, Embeddings laufen zentral solange Rate Limits reichen.
- `[x]` **n8n CE (Hostinger):** geteilte Instanz, Isolation per Projects + `company_id`.
- `[ ]` **Webhook-Router:** zentraler n8n-Router, jede Company bekommt `/webhook/{company_id}/{event_type}`; URLs werden beim Deployment automatisch generiert, Nutzer sieht nichts davon. _Architektur: ein einziger Router-Workflow in n8n, der per Switch-Node auf company_id + event_type routet. Ausstehend._

---

## Coach v2 — Modulares Prompt-System (Erledigt – Juli 2026)

**Ziel:** Weg vom monolithischen Phasen-Prompt in `lib/claude.ts` — hin zu modularen Prompt-Dateien mit klaren Verhaltens-Prinzipien, per Feature-Flag revertierbar.

- `[x]` **Prompt-Module:** `coach/prompts/base.md` (Identität, **Modus-Regel Führen/Ausführen**, Einwand-Trio, Guardrails, Stand-Block) + `phase_diagnose|analyse|plan|umsetzung.md` — inkl. Intent-Typen A/B/C, konkrete-statt-abstrakte Fragen, Default-Vorschläge, hartes Ja-Gate, „Es läuft"-Moment, Betrieb-Weiche (Änderung vs. neuer Wunsch).
- `[x]` **Assembly:** `lib/coach/assemble.ts` — `AXANTILO_SHARED_RULES` + base + Modul pro Request; Dev liest die .md-Dateien bei jedem Request frisch (Prompt-Tuning ohne Neustart); Prod cached + `outputFileTracingIncludes` in `next.config.mjs`.
- `[x]` **Feature-Flag `COACH_V2`** (default an) in `app/api/chat/route.ts`; fail-open auf den alten Pfad, wenn Dateien fehlen. Revert = `COACH_V2=false`.
- `[x]` **Türsteher ausgebaut:** `canAdvanceFromPhase('diagnose')` blockt Phasenwechsel ohne erfasste potenzielle Verbesserung (`no_pain_points`); Übersicht aller Gates (Code vs. Prompt) in `coach/config/phases.json`.
- `[x]` **Tests:** `tests/coach-assemble.test.ts` (Assembly, Flag, Platzhalter-Pipeline, kein hartkodierter Workflow) + erweiterte Gate-Tests.
- `[x]` **Sicherung:** alter Prompt-Stand in `_archive/2026-07-02/`; alte Prompts bleiben unverändert in `lib/claude.ts`.
- `[ ]` **QA:** Simulationslauf (`/simulate-coaching`) über alle 4 Phasen mit Coach v2; Vergleich gegen alten Prompt-Pfad.
- `[ ]` **Zielbild-Migration** (dokumentiert in `coach/zielbild/`): eigenes State-Objekt + State-Extraktion → History-Kompression an Phasengrenzen → Phasen 0/1a/1b als Verfeinerung der Diagnose → server-seitige Orchestrator-Gates.

---

## Sprint 2: Core-Engine — n8n API Anbindung

**Ziel:** Eine erreichbare n8n-Instanz + verifizierte Proxy-Routen. Ohne das kein Playbook-Webhooks und kein Phase-4-Deploy.

**Voraussetzung im Repo (schon vorhanden):** `lib/n8n.ts`, `app/api/n8n/workflows|credentials|executions`, `MOCK_N8N=true` für lokale Entwicklung ohne Server.

### 2.0 Supabase (vor den API-Tests)

Die Deploy-Route schreibt in `workflows`. Falls die Tabelle in eurem Projekt noch fehlt:

- `[x]` **Migration ausführen** (Supabase SQL Editor): _Tabellen `workflows` + `user_credentials` existieren; Unique-Index `user_credentials(user_id,project_id,tool_name)` ergänzt (für Credentials-Upsert). Schema in repo: `supabase/migrations/20260602000000_n8n_sprint2.sql`._

```sql
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete cascade,
  linked_use_case text,
  n8n_workflow_id text,
  name text not null,
  workflow_json jsonb,
  status text default 'draft' check (status in ('draft','inactive','active')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete cascade,
  tool_name text not null,
  n8n_credential_id text,
  status text default 'active',
  created_at timestamptz default now()
);
```

- `[ ]` **RLS später** (Sprint 6) — für Sprint 2 reicht Service-Role-Test oder eingeloggter Dev-User.

### 2.1 Infrastruktur (Hostinger VPS — geteilte Instanz)

> **Entscheidung (Juni 2026):** n8n läuft als **eine geteilte CE-Instanz** für alle Nutzer (nicht pro Nutzer), Mandantentrennung über **n8n Projects + `company_id`**. Host: **Hostinger VPS** (statt ursprünglich Hetzner). VPS, Docker und API-Key sind live; `MOCK_N8N=false`.

- `[x]` **VPS:** Hostinger VPS live, Firewall konfiguriert, 5678 nicht öffentlich.
- `[x]` **Docker Compose:** n8n CE + Postgres + Caddy (HTTPS, Domain z. B. `n8n.axantilo.com`).
- `[x]` **n8n API-Key:** Erzeugt und in Vercel/lokal hinterlegt.
- `[ ]` **Env auf Vercel / lokal:**

```env
N8N_API_URL=https://n8n.srv1046571.hstgr.cloud/api/v1
N8N_API_KEY=<key>
MOCK_N8N=false
```

### 2.2 Backend verifizieren (kein neuer Code nötig, nur testen)

- `[x]` **Mock-Test lokal:** `MOCK_N8N=true` → `POST /api/n8n/workflows` mit Test-User → Eintrag in `workflows` Tabelle, `n8n_workflow_id` mock. _Verifiziert: 200, Zeile mit `mock_wf_…`, `status=inactive`, korrektes n8n-JSON aus `buildN8nWorkflow`._
- `[x]` **Live-Test:** `MOCK_N8N=false` → minimaler Workflow-JSON (Manual Trigger → Set Node) per `createN8nWorkflow` aus Route oder einmaligem Script (`npm run test:n8n`). _Live verifiziert (Juni 2026) via `npm run test:n8n` gegen `n8n.srv1046571.hstgr.cloud`: create → activate (400 bei Manual-Trigger erwartet) → executions → deactivate → delete, alles grün, Cleanup ok._
- `[x]` **Activate/Deactivate:** `PATCH /api/n8n/workflows` mit `action: activate|deactivate`. _Verifiziert: `status` → `active`._
- `[x]` **Executions:** `GET /api/n8n/executions?workflow_id=<db-id>` liefert Liste (oder leer bei neuem WF). _Verifiziert (Mock): Liste mit `success`._ ⚠️ Param heißt `workflow_id` (DB-ID), nicht `workflowId`.

### 2.3 Hello-World-Workflow (Integrations-Checkliste)

1. In n8n UI manuell anlegen: **Manual Trigger** → **Set** (`message: hello`) → speichern.
2. Dieselbe Struktur als JSON aus `lib/workflow-generator.ts` oder Minimal-JSON in Repo unter `scripts/n8n-hello-workflow.json` (optional).
3. Per API anlegen: authentifizierter `POST` an eure Deploy-Route oder direkt `createN8nWorkflow()` in einem einmaligen `npm run test:n8n` Script.
4. In n8n UI: Workflow sichtbar, einmal manuell ausführen → Execution `success`.
5. **Abnahme Sprint 2:** Backend kann Workflow erstellen, aktivieren, Execution abfragen — ohne UI-Phase-4-Flow.

### 2.4 Reihenfolge „So machen wir Sprint 2“ (1–2 Tage)

| Tag | Schritt |
|-----|---------|
| **1** | VPS + Docker + Domain + API-Key; Env in Vercel; `MOCK_N8N=false` nur auf Preview/Prod |
| **1** | Lokal weiter `MOCK_N8N=true` bis VPS steht |
| **2** | Live Hello-World via API; Executions-Route prüfen; Fehlerlog (401 Key, 404 URL) dokumentieren |
| **2** | Kurz in `project.md` / Team-Notiz: finale `N8N_API_URL` + wer Key rotiert |

**QA Sprint 2:** Ein interner Nutzer deployt einen Minimal-Workflow; Status in Supabase `workflows` + n8n UI stimmen überein.

### 2.5 Sprint-2-Runbook (Schritt für Schritt)

> **Prinzip:** Erst alles **lokal mit Mock** grün, dann **einmal** live VPS. So weißt du bei Fehlern, ob es Infrastruktur oder App-Code ist.

| Schritt | Was du tust | Erfolg = |
|--------|-------------|----------|
| **1** | `.env.local`: `MOCK_N8N=true`, Supabase + Auth wie beim Chat | `npm run dev` startet |
| **2** | Supabase: Tabellen aus 2.0 (falls fehlend) | Kein 500 „relation workflows does not exist“ |
| **3** | In Axantilo eingeloggt, `project_id` aus Dashboard/DevContext notieren | UUID parat |
| **4** | Mock-Deploy: authentifizierter `POST /api/n8n/workflows` mit Minimal-Body (siehe unten) | 200 + Zeile in `workflows`, `n8n_workflow_id` beginnt mit `mock_` |
| **5** | `PATCH` mit `action: activate` | `status` → `active` (n8n wird bei Mock übersprungen) |
| **6** | Hetzner: VPS, Docker (n8n + Postgres), Caddy + Domain | `https://n8n.<domain>` lädt n8n UI |
| **7** | n8n: Owner-Account, **API Key** erzeugen | Key in Password-Manager |
| **8** | n8n UI: manuell Manual Trigger → Set → Execute → Execution **success** | Du verstehst die Instanz |
| **9** | Vercel/Prod: `N8N_API_URL`, `N8N_API_KEY`, `MOCK_N8N=false` | Preview deployt |
| **10** | Direkt-Test API (curl oder Postman) an n8n: `GET /api/v1/workflows` mit Header `X-N8N-API-KEY` | JSON-Liste, kein 401 |
| **11** | Derselbe Deploy wie Schritt 4, aber `MOCK_N8N=false` auf der Umgebung | `n8n_workflow_id` echte ID; Workflow in n8n UI sichtbar |
| **12** | `GET /api/n8n/executions?workflowId=<n8n_id>` | Antwort ok (leer oder mit Runs) |
| **13** | Sprint-2-Checkboxen in dieser Datei abhaken | Sprint 3 freigeben |

**Minimal-Body für Schritt 4/11** (anpassen: `project_id`, einfacher Workflow):

```json
{
  "project_id": "<uuid>",
  "name": "Sprint2 Hello",
  "workflow": {
    "id": "wf_test",
    "title": "Hello Test",
    "linked_pain_point": "",
    "steps": [
      { "id": "s1", "label": "Start", "type": "trigger" },
      { "id": "s2", "label": "Set hello", "type": "action" }
    ]
  },
  "mappings": [
    { "step_id": "s1", "tool": "manual" },
    { "step_id": "s2", "tool": "set", "parameters": { "message": "hello" } }
  ]
}
```

**Typische Fehler:**

| Symptom | Ursache | Fix |
|---------|---------|-----|
| 401 auf n8n | Falscher API-Key oder URL ohne `/api/v1` | `N8N_API_URL=https://host/api/v1` |
| Connection refused | n8n nicht erreichbar von Vercel | Domain + HTTPS, nicht localhost |
| 500 Supabase | Tabelle `workflows` fehlt | Schritt 2 |
| Workflow draft, keine n8n-ID | n8n-Fehler wird geschluckt | Server-Logs; Schritt 10 isoliert testen |

---

## Sprint 3: Agent-Orchestrierung (nach n8n API)

**Ziel:** Alle Hintergrund-Agenten an einer Pipeline — Coach bleibt allein im Chat; Canvas-Qualität (Thema, ein Workflow, volle Automatisierung, Merge) wird technisch erzwungen.

**Abhängigkeit:** Sprint 2 erledigt (mindestens Webhook-URL + API-Key für Playbook-n8n-Workflow).

### 3.0 Foundation

- `[x]` **`lib/agent-orchestration.ts`:** `runCanvasPipeline(complete, { sessionId, phase, history, canvas })` mit strukturiertem Log (`[agent-sync][orchestration][step]`), Short-circuit außerhalb `plan`, Token-Summe. _Live verifiziert: 3 Agenten, ~2.5k Tokens._
- `[x]` **`lib/agents/types.ts`:** Gemeinsame Typen (`AgentResult`, `SupervisorResult`, `ResearchBrief`, `WorkflowQAResult`, `PipelineResult`).
- `[x]` **Canvas-Worker umbinden:** `app/api/canvas-worker/route.ts` ruft Pipeline auf; bei `block`/`revise_coach` keine Extraktion, sonst `workerDirective` (Supervisor-Anweisung + Research-Bullets + QA-Fixes) in den Extraktions-Prompt injiziert.
- `[ ]` **DevContextModal:** Orchestration-Schritte + Token pro Agent anzeigen (Debug). _Backend liefert `orchestration.logs` bereits in der canvas-worker-Antwort; UI-Anzeige offen._

### 3.1 Wissensdatenbank-Tool statt Industry Playbook Agent (teilweise erledigt)

> **Entscheidung (Juni 2026):** Der ursprünglich geplante Industry-Playbook-Agent **entfällt**. Stattdessen nutzt der Coach die zentrale **RAG-Wissensdatenbank** über das Tool **`search_knowledge`** (in allen Phasen verfügbar): Er fragt gezielt ab (UI-How-tos „wie macht man X", Tool-Setup, abgedeckte Use-Cases, **bevor** er einen Workflow/Schritt vorschlägt oder baut) und **bewertet die Treffer selbst** — passt die Branche/das Tool nicht oder ist die Relevanz niedrig, ignoriert er sie und nutzt eigenes Wissen. Die `industry_playbooks`/n8n/NotebookLM-Punkte unten sind damit **hinfällig**.
>
> - `[x]` **Tool `search_knowledge`** (`lib/ai-tools.ts`) + Handler in `app/api/chat/route.ts` (ruft `searchKnowledge`, liefert Treffer mit Relevanz + `branche`-Metadaten zurück). Phasenunabhängig.
> - `[x]` **Coach-Prompt:** Regel 10 in `AXANTILO_SHARED_RULES` — wann abfragen, Treffer selbst bewerten, Branche prüfen, nichts erfinden, Tool/Datenbank nie im Chat erwähnen.
> - `[x]` **Auto-Injektion entfernt** — RAG ist jetzt coach-gesteuert statt immer in den Prompt gedrückt (keine unpassenden Infos mehr erzwungen).
> - `[ ]` **QA:** 3 Branchen testen — Coach zieht passende Einträge, ignoriert fremde Branchen, leakt das Tool nicht.

~~Ursprünglicher Plan (hinfällig — durch `search_knowledge` ersetzt):~~

- `[ ]` **Supabase:** Tabelle `industry_playbooks` (`branche`, `content` jsonb/text, `updated_at`).
- `[ ]` **n8n Workflow:** Webhook `POST /webhook/build-playbook` → NotebookLM / Google AI → Playbook-Text → Upsert Supabase.
- `[ ]` **Trigger:** Nach Onboarding (`app/api/onboarding` oder Session-Create) → Webhook mit `branche` aus Session.
- `[ ]` **Chat Injection:** `app/api/chat/route.ts` lädt Playbook vor erstem Coach-Call (`sessions.branche`).
- `[ ]` **QA:** 3 Branchen testen — Coach erwähnt branchentypische Pain Points ohne Halluzination.

### 3.2 Topic Research Agent (session-spezifisch, Phase Plan)

- `[x]` **`lib/agents/topic-research.ts`:** Input = letzte N Chat-Nachrichten + aktiver Pain Point + Tools aus Canvas; Output = `ResearchBrief` (Bullets, Quellen-Hinweise, offene Fragen). Nur bei content-/marketing-Themen (`topicNeedsResearch`).
- `[ ]` **Tool-Hooks (iterativ):** zuerst nur LLM + Canvas-Kontext _(erledigt)_; später n8n-Subworkflow (YouTube, Web-Search) wenn Sprint 2 Webhooks stehen.
- `[ ]` **Regel:** Nur ausführen wenn Phase `plan` und Coach-Thema Recherche erfordert (Supervisor kann `skip_research` setzen).
- `[ ]` **QA:** Chat „YouTube zu Reels“ → Brief enthält Clipping/Schnitt, kein Meta-Suite-vor-Video.

### 3.3 Supervisor Agent (Alignment)

- `[x]` **`lib/agents/supervisor.ts`:** Prüft: (a) aktuelles Chat-Thema, (b) genau ein `linked_pain_point`, (c) Update bestehender Workflow vs. neuer, (d) kein Neben-Thema. Fail-open bei Fehler.
- `[x]` **Output:** `approved | revise_coach | block` + `instruction_for_worker` + optional `coach_hint` (nur Dev/Logs, nicht an User streamen).
- `[ ]` **Bei `revise_coach`:** Canvas-Worker nicht starten; optional async Flag in Session für nächsten Coach-Turn (oder still blockieren + leerer Canvas-Diff).
- `[ ]` **QA:** Zwei Pain Points im Canvas, Chat nur über einen → kein zweiter Workflow.

### 3.4 Workflow QA Agent (Critic)

- `[x]` **`lib/agents/workflow-qa.ts`:** Checkliste: chronologische Schritte, max. Automatisierung, Human nur Strategie/Skript-Freigabe/vor Publish, Titel 3–5 Wörter, Tools aus `use_cases`. Plus deterministische `staticWorkflowChecks` (Titel-Länge, Schrittzahl, Publish-vor-Content).
- `[x]` **Output:** `pass | fail` + `fixed_steps?` (QA darf Steps vorschlagen, Worker übernimmt als Zwangsvorgabe via `workerDirective`).
- `[ ]` **Merge mit Supervisor:** Ein Mistral-Call mit zwei JSON-Sektionen **oder** zwei Calls — Start mit **einem** Call (`workflow-qa.ts` inkl. Alignment) zur Kostenkontrolle; bei Qualitätsproblemen splitten.
- `[ ]` **QA:** Reels-Workflow ohne „Skript in Business Suite vor Aufnahme“.

### 3.5 Bestehende Agenten an Pipeline hängen

- `[x]` **Canvas Worker:** Extraktions-Prompt erhält die ZWINGENDE `workerDirective` aus Supervisor + QA-Output + `ResearchBrief`.
- `[ ]` **Memory Guardian:** Unverändert parallel nach Chat; Pipeline liest `[CORE FACTS]` aus Session-Memory.
- `[ ]` **Phase Summarizer:** Bei Phasenwechsel unverändert `/api/summarize`; Orchestration betrifft nur `trigger_canvas_update`.

### 3.6 Abnahme Sprint 3

- `[ ]` **E2E intern:** Phase-3-Chat → Research → Supervisor → QA → Canvas — ein Workflow, sinnvolle Steps, Titel kurz.
- `[ ]` **Regression:** Phase 1/2 Canvas-Updates ohne Research/QA-Overhead (Pipeline short-circuit außerhalb `plan`).
- `[ ]` **Kosten-Check:** Token pro Pipeline in DevContext; Ziel: &lt; 3 Small-Calls pro Canvas-Update.

---

## Sprint 4: Memory Guardian Hardening, Voice Mode & UI Polish

- `[x]` **Memory Guardian:** Strikte Trennung `[CORE FACTS]` / `[LATEST CONTEXT]` in `/api/memory-update`; Coach-Prompt liest nur CORE für Ziele.
- `[x]` **Voice Mode (MVP):** Mikrofon → Web Speech API → Textfeld → Senden.
- `[ ]` **Voice Mode (Polish):** Push-to-talk, Permissions, Fehler-UI.
- `[x]` **Workflow-Visualisierung:** `components/canvas/WorkflowGraph.tsx` — read-only n8n-Look (SVG-Node-Graph aus `workflow_json`, Bezier-Kanten, Tool-Icons/Farben). Live verifiziert.
- `[ ]` **UX Polish:** Onboarding Dark Mode / Motion.
- `[ ]` **Token Counter:** DevContextModal inkl. Orchestration-Breakdown (aus Sprint 3).

### 4.1 Mindset-Vermittlung an Nutzer (Coach-Prompt-Update)

- `[x]` **`knowledge/mindset.md`:** 8 Kernhaltungen zu KI/Automatisierung/Kosten, die Nutzer verinnerlichen sollen _(angelegt)_. Besonders: Kosten sind Investition, nicht Ausgabe; Menschen für Strategie, KI für Volumen; kleine vernetzte Workflows schlagen große Einzelne.

- `[ ]` **Mindsets in Chat-Context injizieren** (WICHTIG — Dokumentation allein reicht nicht):
  - **`app/api/chat/route.ts`:** Vor jedem Coach-Call Phase-abhängige Mindsets aus `knowledge/mindset.md` laden und **in den System-Prompt injizieren** (ähnlich wie RAG-Knowledge).
  - **Phase-Mapping:** Phase 1 = Mindsets 2+4; Phase 2 = Mindset 7; Phase 3 = Mindsets 1+3+4+6; Phase 4 = Mindsets 5+8.
  - **Format:** Kurzer Block (~200 Tokens) im System-Prompt: „Deine Haltung zu diesem Thema:" + relevanter Mindset-Auszug.
  - **Nicht explizit:** Klaro liest die Mindsets stille, verkauft sie nicht als Lehrpunkte.

- `[ ]` **QA:** Testlauf Phase 1–4 — Nutzer nimmt diese Haltungen natürlich auf, ohne dass es predigt wirkt. Besonders Phase 3: Kosten-Mindset sollte in jeder Tool-Empfehlung subtil sichtbar sein.

---

## Sprint 5: Phase 4 & Workflow Deployment

> **Neue Architektur (Juni 2026) — Node-Map:** Die KI sieht **nie** n8n-Node-Typen, sondern nur logische Baustein-Namen (`email_senden`, `crm_updaten`, …). Eine **Node-Map** (`node_map.json` im Root) übersetzt *Baustein + Tool → exaktes n8n-Node-JSON*. Das eliminiert KI-Halluzinationen bei der Workflow-Generierung.
>
> - `[ ]` `node_map.json` im Root anlegen (Baustein × Tool → Node-JSON-Template).
> - `[ ]` Generator nutzt die Node-Map statt KI-generierter Node-Typen.

**Ziel:** Canvas-Plan → echtes n8n-JSON → Deploy. Orchestration aus Sprint 3 gilt weiter; hier kommt **Ausführung**.

- `[x]` **`lib/workflow-generator.ts`:** Mapping Canvas-Steps → n8n-Nodes inkl. `AXANTILO:`-Namespace-Präfix (`withAxantiloPrefix`); Unit-getestet. Live verifiziert (`AXANTILO: Reels Pipeline`).
- `[x]` **Deploy-UI:** Phase 4 — Tool-Mapping, Credentials-Popup, `POST /api/n8n/workflows` (in `app/chat/page.tsx`); zusätzlich **`/workflows`-Tab** (Liste + Graph + Aktivieren/Test/Löschen). _Hinweis: ohne live n8n degradiert Deploy sauber zu `draft` (n8n-Fehler abgefangen)._
- `[x]` **Execution Monitor:** Status-Pill + Ausführungen pro Workflow im `/workflows`-Tab aus `/api/n8n/executions`.
- `[ ]` **Workflow teilen:** Nutzer können fertige Workflows per Link teilen, damit z.B. die IT oder externe Dienstleister die Credentials und Zugänge eintragen können (Credential-Delegation).
- `[ ]` **E2E Test live:** Phase 1 → 4 mit live deploytem Workflow — wartet auf n8n-VPS (`MOCK_N8N`/Live). Mock-/Draft-Pfad + Orchestrierung E2E im Browser verifiziert.

---

## Sprint 6: Security & Credentials (Der Türsteher)

> **Update (Juni 2026):** Durch die **zentralen OAuth-Apps** (Google/Microsoft, siehe „Zentrale Infrastruktur") entfällt das per-User-Cloud-Setup — der Nutzer klickt nur „Erlauben". Dieser Sprint deckt damit primär noch ab: (a) API-Key-Tools ohne zentrale OAuth, (b) verschlüsselte Speicherung, (c) RLS / Mandantentrennung via `company_id`.

- `[ ]` **Tabellen:** `user_credentials`, `workflows` (falls noch nicht in Prod-Migration).
- `[ ]` **Credential Collection UI** vor Deploy.
- `[ ]` **`lib/encryption.ts`:** AES-256-GCM für API-Keys.
- `[x]` **RLS:** Strikt `user_id == auth.uid()`. _RLS aktiviert auf `projects`, `workflows`, `user_credentials` mit SELECT/INSERT/UPDATE/DELETE-Policies (Migration `20260602_enable_rls.sql`, live angewandt). Kritischer `rls_disabled`-Advisory geklärt._
- `[ ]` **Security-Test:** Cross-User-Zugriff muss fehlschlagen.

---

## Sprint Qualität: Pfad-Logik Phase 1 (geplant)

**Ziel:** Die vier Onboarding-Pfade (`{{ziel}}`-Variable) im Coach sauber ausdifferenzieren — heute nur teilweise im Prompt angelegt.

- `[ ]` **Pfad A (Von Null):** volle Diagnose (weiß nicht wo anfangen).
- `[ ]` **Pfad B (Konkrete Ideen):** mitgebrachte Idee validieren + ROI evaluieren.
- `[ ]` **Pfad C (Evaluativ):** prüfen, ob KI überhaupt sinnvoll ist; unsinnige Use-Cases herausfiltern (Grundton trotzdem pro-KI).
- `[ ]` **Pfad D (Briefing-Export):** kein Deployment, sondern architektonisches Briefing/Konzept zur Übergabe an IT/Agentur.
- `[ ]` **QA:** je ein Testlauf pro Pfad — Coach verhält sich pfad-konform.

---

## Sprint 6.5: Data Layer — Datenablage pro Account

**Ziel:** Jeder Account bekommt automatisch eine strukturierte Datenablage für Automationsdaten — ohne Setup-Aufwand für den Nutzer. Eigene Lösungen (CRM, DB, Sheets) werden als vollwertige Alternative erkannt und angebunden.

- `[x]` **Supabase Migration** (`20260618000000_data_layer.sql`): `user_data_layer`, `user_data_tables`, `user_data_rows` mit RLS.
- `[x]` **`lib/data-layer.ts`:** `ensureDataLayer()` — idempotentes Auto-Provisioning (supabase / custom). `formatDataLayerForPrompt()` für Coach-Kontext.
- `[x]` **Phase-2-Frage:** Mundgerechte Datenquellen-Frage nach Tool-Stack-Erfassung; Canvas-Update mit `data_layer` (source_type, source_name).
- `[x]` **Phase-3: Axantilo Steuerungsagent vorschlagen** — Coach schlägt nach allen Pain-Point-Workflows proaktiv einen WhatsApp-basierten Steuerungsagenten vor, der alle Automationen per Nachricht steuert und Ergebnisse zurückschickt.
- `[x]` **Canvas-Feld `data_layer`** in `lib/types.ts` + `lib/canvas-normalize.ts`.
- `[x]` **`{{data_layer}}`-Variable** in Phase-3- und Phase-4-Prompts (`lib/claude.ts`).
- `[x]` **Trigger:** Erster Workflow-Deploy → `ensureDataLayer()` idempotent (fire-and-forget).
- `[ ]` **Visualisierung (kurzfristig):** Airtable via n8n-Airtable-Node — Coach schlägt in Phase 3/4 Airtable-Schreibschritt vor, wenn Nutzer Daten visuell sehen will. Kein Axantilo-Feature nötig.
- `[ ]` **In-App-Viewer (Backlog):** Einfacher Tabellen-Viewer im `/dashboard`-Tab für `user_data_rows` — mittelfristig, kein MVP-Feature.

---

## Sprint 7: Alpha User Testing (Extern)

- `[ ]` **Alpha-Invite:** 5–10 Testkunden.
- `[ ]` **Posthog / Observation:** Hürden Chat + Canvas.
- `[ ]` **Prompt-Tuning:** Orchestration-Regeln anhand echter Sessions.

---

## Sprint 8: Billing & Go-Live

- `[ ]` **Stripe:** Checkout + Webhook.
- `[ ]` **Paywall:** Vor Phase-4-Deploy.
- `[ ]` **Legal:** Impressum, AGB, DSGVO.
- `[ ]` **Go-Live.**

---

## Post-MVP: Events & KI-Intelligenz

**Nicht Teil von v1.0.** Baut auf dem Data Layer (Sprint 6.5) auf.

- `[ ]` **`events`-Tabelle:** jede Workflow-Execution wird geloggt → Basis für KI-Insights & Selbstverbesserung.
- `[ ]` **Vier Stufen:** Einzelworkflows → vernetzte Workflows → KI-Intelligenz → Selbstverbesserung.
- `[ ]` **Dashboard Builder:** automatisch generiert aus deployten Workflows + Data Layer (nicht manuell konfiguriert). Kein MVP-Feature.

---

## Backlog (optional, nach Sprint 3 / v1.1+): Coach Advisor

**Nicht Teil von v1.0.** Der **Supervisor** (Sprint 3) prüft nur Canvas-Updates. Der **Coach Advisor** wäre proaktiv: Session-Big-Picture, fehlende Phasen-Ziele, sanfte Steuerung des Haupt-Coaches — **ohne** zweiten sichtbaren Chatbot.

**Abgrenzung:**

| | Supervisor | Coach Advisor |
|---|------------|----------------|
| Wann | Nur bei `trigger_canvas_update` | Alle 3–5 Coach-Turns (oder Phasenwechsel) |
| Job | „Darf dieser Canvas-Diff?“ | „Was ist das aktive Thema? Was als Nächstes klären?“ |
| Output | Gate für Worker | Internes Briefing → injiziert in **nächsten** Coach-System-Prompt |
| Workflow planen | Nein (macht QA + Worker) | Grobe Roadmap pro Pain Point, kein finales JSON |

**Geplante Umsetzung (wenn Alpha-Feedback: Coach driftet trotzdem):**

- `[ ]` **`lib/agents/coach-advisor.ts`:** Input = Phase, Canvas-Snapshot, letzte 10 Messages, Playbook, CORE FACTS; Output = `CoachBrief` (`active_topic`, `next_question`, `do_not_open_topics[]`, `ready_for_canvas: boolean`).
- `[ ]` **Trigger:** Nach Memory-Update oder vor `/api/chat` wenn `turn_count % 5 === 0`.
- `[ ]` **Injection:** `CoachBrief` als kurzer Block im System-Prompt (max. ~300 Tokens), nicht als User-Message.
- `[ ]` **Guardrails:** Advisor darf **keine** Nutzer-Texte generieren; nur Metadaten. Nutzer sieht weiterhin nur den Haupt-Coach.
- `[ ]` **QA:** 5 Sessions — weniger Themen-Drift, kein „zweiter Coach“-Gefühl im UI.

**Start-Kriterium:** Sprint 3 Orchestration live + mindestens 3 interne Phase-3-Tests; Advisor nur wenn Supervisor allein nicht reicht.

---

## Vorlagen & Dokumente (Templates)

Viele Workflows verarbeiten wiederkehrende Dokumente/Texte (Angebote, Verträge, Reports, Standard-Mails, WhatsApp, KI-Prompts). Axantilo templatisiert sie: konkrete Werte → dynamische Platzhalter `{{…}}`, die die KI zur Laufzeit füllt.

**Jetzt umgesetzt (v1):**

- `[x]` **Text-Extraktion für ALLE textbasierten Dateien** (`/api/attachments`): PDF via `pdf-parse` + **OCR-Fallback** (Mistral `mistral-ocr-latest`, `lib/image-ocr.ts → extractTextFromPdf`) für gescannte PDFs; alle anderen Textformate (.txt/.md/.csv/.tsv/.json/.html/.xml/.yaml/.log/.rtf …) per MIME/Endung **oder** Inhalts-Erkennung (`looksLikeText`) — keine feste Whitelist. Datei landet im `chat-uploads`-Bucket; Extrakt geht via `formatAttachmentsForCoach` in den Coach-Kontext.
- `[x]` **Datenmodell `DocumentTemplate`** (`lib/types.ts`, `canvas.document_templates`) — role (input/output), delivery (document/text), target_format, source, Platzhalter-Liste **+ `example_filled`** (anonymisiertes Voll-Beispiel); Normalisierung + Erhalt über Canvas-Sync in `lib/canvas-normalize.ts`.
- `[x]` **Templatisierung durch den Coach** — Tool `create_document_template` (`lib/ai-tools.ts`, Phase 3+4): der Coach erkennt selbst variable vs. feste Stellen (bestätigt mit dem Nutzer, fragt nur bei Unklarheit), liefert `content` (mit Platzhaltern), `placeholders` und `example_filled`. `/api/canvas-worker/create-template` speichert nur (kein eigener LLM-Call) — der Coach hat den vollen Kontext.
- `[x]` **Beispiel → KI-System-Prompt:** `lib/document-template.ts → buildTemplateAiInstruction` baut aus Vorlage + Platzhaltern + anonymisiertem Beispiel die Lauf­zeit-KI-Anweisung; bei gebautem Workflow wird sie automatisch auf den Füll-Schritt (`findTemplateFillStep`) als `StepConfig.systemPrompt` gelegt (sichtbar/editierbar im Schritt-Konfig).
- `[x]` **Phase-3-Discovery** & **Phase-4-Einbau** (`lib/claude.ts`): klärt Quelle der Vorlage, baut sie via `edit_workflow` in den Workflow ein (echtes Dokument → KI-Füll-Schritt + Google Docs/Sheets; einfache Mail → Text je Lauf).
- `[x]` **Canvas-Rendering** „Vorlagen" mit hervorgehobenen Platzhaltern + anonymisiertem Beispiel (`components/canvas/RoadmapCanvas.tsx`).

**Später (mit Begründung + Google-Äquivalenten):**

- `[ ]` **DOCX** (`mammoth`) parsen ↔ **Google Docs** als Cloud-Äquivalent (Live-Lesen/Schreiben via Google-API über zentrale OAuth). Word ist lokal/offline schlecht anbindbar — für Automationen Google Docs bevorzugen.
- `[ ]` **XLSX** (`sheetjs`) parsen ↔ **Google Sheets** (Live-Lesen/Schreiben). CSV geht heute schon als Text-Upload.
- `[ ]` **PPTX**-Parser ↔ **Google Slides**. Selteneres Format, niedrige Priorität.
- `[ ]` **Google-Live-Anbindung**: Vorlagen direkt aus bestehenden Google Docs/Sheets ziehen statt Upload (braucht zentrale OAuth-Scopes).
- `[x]` **`StepConfig.systemPrompt` → n8n-Node-Parameter verdrahtet:** `buildAiNodeParameters` (`lib/workflow-deploy.ts`) übersetzt den System-Prompt (Vorlage + anonymisiertes Beispiel) in echte n8n-Parameter — AI Agent → `options.systemMessage`, Basic LLM Chain → `messages.messageValues` (SystemMessagePromptTemplate). `buildParameters` nutzt das beim Deploy. **Live getestet** (n8n MCP, Mistral): Agent füllte eine Angebots-Vorlage korrekt aus Auftragsdaten, anonymisiertes Beispiel nur als Stil-Vorlage → Status `success`.
- `[x]` **Echte Agent-Struktur im Build:** AI-Schritte werden als `@n8n/n8n-nodes-langchain.agent` aufgelöst (`preferAiNode`) und bekommen beim Build automatisch einen Pflicht-Chat-Model-Sub-Node (Mistral Cloud, EU/DSGVO) via `ensureRequiredSubNodes` (`lib/ai-subnodes.ts`, `app/api/n8n/build-workflow`). Memory/Tool-Slots optional erweiterbar.
- `[ ]` **Datei-Lieferung (Google Docs/Sheets) zur Laufzeit verdrahten:** Der Agent erzeugt den fertigen Dokument-/Angebotstext (live bewiesen). Die Auslieferung als echte Datei (Google Docs „create"/„replace text", Google Sheets append) ist als Node im Build vorhanden, aber die Node-Parameter (Ziel-Doc, Platzhalter-Mapping) werden noch nicht automatisch gesetzt — Folge-Schritt. Hinweis: n8n-Instanz hat Google Sheets/Drive-Creds, aber **kein Google Docs** (googleDocsOAuth2Api fehlt) und **kein OpenAI** — Chat-Model-Default daher Mistral.
- `[ ]` **Optionales Vektor-Embedding** hochgeladener Vorlagen — nur falls je nötig (heute passt der Vorlagentext in den Coach-Kontext, kein RAG nötig).

---

## Changelog Roadmap

| Version | Änderung |
|---------|----------|
| v1.5 | Coach v2: modulares Prompt-System (`coach/prompts/` + `lib/coach/assemble.ts`, Flag `COACH_V2`), Modus-Regel/Einwand-Trio/Ja-Gate als Basis-Prinzipien, Diagnose-Gate im Türsteher, Zielbild-Doku `coach/zielbild/` |
| v1.4 | Vorlagen & Dokumente: PDF-Parsing + OCR-Fallback, `DocumentTemplate`-Modell, Templatisierung (`create_document_template`), Phase-3-Discovery + Phase-4-Einbau, Canvas-Rendering „Vorlagen"; DOCX/XLSX/PPTX + Google-Live in Roadmap |
| v1.3 | Zentrale Infrastruktur (Shared OAuth/Twilio/Resend/n8n), Webhook-Router, Node-Map-Builder, RAG Knowledge Base (erledigt), Sprint Qualität (Pfad-Logik inkl. Pfad D), Post-MVP Data Layer + Dashboard Builder; n8n Host Hetzner→Hostinger (live) |
| v1.2 | Backlog Coach Advisor; Sprint 2 Runbook + Supabase 2.0 |
| v1.1 | Sprint 2 ausgebaut (How-to); Sprint 3 = komplette Agent-Orchestrierung; Critic/Supervisor/Research aus verstreuten Sprints gebündelt; Agent-Tabelle + Pipeline-Diagramm |
