# Klaro – Master Project Roadmap (v1.1 Chronologisch)

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

## Sprint 2: Core-Engine — n8n API Anbindung

**Ziel:** Eine erreichbare n8n-Instanz + verifizierte Proxy-Routen. Ohne das kein Playbook-Webhooks und kein Phase-4-Deploy.

**Voraussetzung im Repo (schon vorhanden):** `lib/n8n.ts`, `app/api/n8n/workflows|credentials|executions`, `MOCK_N8N=true` für lokale Entwicklung ohne Server.

### 2.0 Supabase (vor den API-Tests)

Die Deploy-Route schreibt in `workflows`. Falls die Tabelle in eurem Projekt noch fehlt:

- `[x]` **Migration ausführen** (Supabase SQL Editor): _Tabellen `workflows` + `user_credentials` existieren; Unique-Index `user_credentials(user_id,project_id,tool_name)` ergänzt (für Credentials-Upsert). Schema in repo: `supabase-migrations/20260602_n8n_sprint2.sql`._

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

### 2.1 Infrastruktur (Hetzner)

- `[ ]` **VPS:** Ubuntu 22/24, Firewall: 22 (SSH), 80/443 (Caddy), **nicht** 5678 öffentlich (nur intern oder VPN).
- `[ ]` **Docker Compose:** n8n CE + Postgres + Caddy (HTTPS, Domain z. B. `n8n.klaro.de`).
- `[ ]` **n8n API-Key:** In n8n UI → Settings → API → Key erzeugen.
- `[ ]` **Env auf Vercel / lokal:**

```env
N8N_API_URL=https://n8n.klaro.de/api/v1
N8N_API_KEY=<key>
MOCK_N8N=false
```

### 2.2 Backend verifizieren (kein neuer Code nötig, nur testen)

- `[x]` **Mock-Test lokal:** `MOCK_N8N=true` → `POST /api/n8n/workflows` mit Test-User → Eintrag in `workflows` Tabelle, `n8n_workflow_id` mock. _Verifiziert: 200, Zeile mit `mock_wf_…`, `status=inactive`, korrektes n8n-JSON aus `buildN8nWorkflow`._
- `[ ]` **Live-Test:** `MOCK_N8N=false` → minimaler Workflow-JSON (Manual Trigger → Set Node) per `createN8nWorkflow` aus Route oder einmaligem Script (`npm run test:n8n`). _Wartet auf VPS + API-Key._
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
| **3** | In Klaro eingeloggt, `project_id` aus Dashboard/DevContext notieren | UUID parat |
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

### 3.1 Industry Playbook Agent (Pre-Research, branchenweit)

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

- `[ ]` **Memory Guardian:** Strikte Trennung `[CORE FACTS]` / `[LATEST CONTEXT]` in `/api/memory-update`; Coach-Prompt liest nur CORE für Ziele.
- `[ ]` **Voice Mode (MVP):** Mikrofon → Web Speech API → Textfeld → Senden.
- `[ ]` **Voice Mode (Polish):** Push-to-talk, Permissions, Fehler-UI.
- `[x]` **Workflow-Visualisierung:** `components/canvas/WorkflowGraph.tsx` — read-only n8n-Look (SVG-Node-Graph aus `workflow_json`, Bezier-Kanten, Tool-Icons/Farben). Live verifiziert.
- `[ ]` **UX Polish:** Onboarding Dark Mode / Motion.
- `[ ]` **Token Counter:** DevContextModal inkl. Orchestration-Breakdown (aus Sprint 3).

---

## Sprint 5: Phase 4 & Workflow Deployment

**Ziel:** Canvas-Plan → echtes n8n-JSON → Deploy. Orchestration aus Sprint 3 gilt weiter; hier kommt **Ausführung**.

- `[x]` **`lib/workflow-generator.ts`:** Mapping Canvas-Steps → n8n-Nodes inkl. `KLARO:`-Namespace-Präfix (`withKlaroPrefix`); Unit-getestet. Live verifiziert (`KLARO: Reels Pipeline`).
- `[x]` **Deploy-UI:** Phase 4 — Tool-Mapping, Credentials-Popup, `POST /api/n8n/workflows` (in `app/chat/page.tsx`); zusätzlich **`/workflows`-Tab** (Liste + Graph + Aktivieren/Test/Löschen). _Hinweis: ohne live n8n degradiert Deploy sauber zu `draft` (n8n-Fehler abgefangen)._
- `[x]` **Execution Monitor:** Status-Pill + Ausführungen pro Workflow im `/workflows`-Tab aus `/api/n8n/executions`.
- `[ ]` **E2E Test live:** Phase 1 → 4 mit live deploytem Workflow — wartet auf n8n-VPS (`MOCK_N8N`/Live). Mock-/Draft-Pfad + Orchestrierung E2E im Browser verifiziert.

---

## Sprint 6: Security & Credentials (Der Türsteher)

- `[ ]` **Tabellen:** `user_credentials`, `workflows` (falls noch nicht in Prod-Migration).
- `[ ]` **Credential Collection UI** vor Deploy.
- `[ ]` **`lib/encryption.ts`:** AES-256-GCM für API-Keys.
- `[x]` **RLS:** Strikt `user_id == auth.uid()`. _RLS aktiviert auf `projects`, `workflows`, `user_credentials` mit SELECT/INSERT/UPDATE/DELETE-Policies (Migration `20260602_enable_rls.sql`, live angewandt). Kritischer `rls_disabled`-Advisory geklärt._
- `[ ]` **Security-Test:** Cross-User-Zugriff muss fehlschlagen.

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

## Changelog Roadmap

| Version | Änderung |
|---------|----------|
| v1.2 | Backlog Coach Advisor; Sprint 2 Runbook + Supabase 2.0 |
| v1.1 | Sprint 2 ausgebaut (How-to); Sprint 3 = komplette Agent-Orchestrierung; Critic/Supervisor/Research aus verstreuten Sprints gebündelt; Agent-Tabelle + Pipeline-Diagramm |
