# Klaro – Master Project Roadmap (v1.0 Chronologisch)

Dieses Dokument ist die **Single Source of Truth** für alle anstehenden Entwicklungs-, Test- und Business-Schritte bis zum offiziellen Launch der v1.0. 
Wir priorisieren den **Kernwert (Automatisierung)** und bauen die Features iterativ auf. **Security** ist der finale Checkpoint, bevor echte Nutzer das System betreten.

> [!IMPORTANT]
> Jeder Sprint (Meilenstein) endet mit einem internen QA-Test. So vermeiden wir, dass wir Fehler bis zum Ende mitschleppen.

---

## Sprint 1: Performance & Basis-KI-Wechsel (Erledigt)
*Ziel: Die KI-Engine konsolidieren und Kosten senken.*
- `[x]` **Mistral-Only Engine:** Haupt-Chat und Canvas-Worker nutzen ausschließlich Mistral (`mistral-large-latest` für Chat, `mistral-small-latest` für Background-Tasks).
- `[x]` **Blob Builder Entkopplung:** Das Canvas-Update passiert asynchron über den Worker; das UI lauscht per Supabase Realtime auf Changes.

---

## Sprint 2: Core-Engine — n8n API Anbindung
*Ziel: Die n8n-Engine so früh wie möglich anbinden, damit Klaro überhaupt echte Workflows bauen kann (Phase 4).*
- `[ ]` **Hetzner VPS Setup:** n8n Community Edition über Docker Compose aufsetzen (inkl. Postgres und Caddy für HTTPS).
- `[ ]` **Backend Routen (`/api/n8n/*`):** Proxy-Routen im Next.js-Backend erstellen, um Workflows sicher auf n8n anzulegen.
- `[ ]` **Integration Test (Intern):** Kann unser Backend per API einen simplen "Hello World"-Workflow in der n8n Instanz generieren und starten?

---

## Sprint 3: Der Industry Playbook Agent (Pre-Research)
*Ziel: Branchenspezifisches Wissen in Klaro pumpen, bevor der Chat überhaupt startet.*
- `[ ]` **n8n Webhook anlegen:** Workflow in n8n bauen (`/webhook/build-playbook`), der NotebookLM (via Google AI) abfragt.
- `[ ]` **Supabase Sync:** n8n speichert das Playbook in `industry_playbooks`.
- `[ ]` **Chat Injection:** In `app/api/chat/route.ts` das Playbook vor dem ersten LLM-Call abrufen und in den System-Prompt injizieren.
- `[ ]` **AI-Test (Intern):** 10 Testchats mit verschiedenen Branchen. Nutzt der Mistral-Coach die Playbook-Daten korrekt?

---

## Sprint 4: Memory Guardian & UI Polish
*Ziel: Die UX für den Endnutzer perfektionieren und verhindern, dass das KI-Gedächtnis durch irrelevante Chat-Nachrichten "verklärt" wird.*
- `[ ]` **Memory Guardian Implementieren:** Die `/api/memory-update` Route so anpassen, dass sie strikt in zwei Bereiche trennt: `[CORE FACTS]` (unveränderliche harte Fakten) und `[LATEST CONTEXT]` (flüchtige Gesprächsdetails). So wird verhindert, dass Kernprioritäten durch Smalltalk verwässert werden.
- `[ ]` **React Flow Integration:** `components/canvas/WorkflowGraph.tsx` bauen. Read-only Darstellung der generierten n8n-Workflows mit Custom Nodes (Visualisierung).
- `[ ]` **Framer-Motion & UX Polish:** Das Onboarding-Formular visuell auf Premium trimmen (Dark Mode, Glow-Effekte, saubere Transitions).
- `[ ]` **Token Counter:** Im DevContextModal anzeigen, wie viele Token Mistral gerade verbraucht.

---

## Sprint 5: Phase 4 & Workflow Deployment
*Ziel: Die Lücke zwischen Canvas-Plan und funktionierender n8n-Automatisierung komplett schließen.*
- `[ ]` **Critic Agent (Quality Assurance):** Ein Mistral-Small Aufruf prüft den Workflow-Draft aus Phase 3 auf Logikfehler, bevor er dem Nutzer im Canvas gezeigt wird.
- `[ ]` **JSON Generator:** `lib/workflow-generator.ts` baut aus dem Canvas-Plan das fertige n8n-JSON (die echte Node-Struktur).
- `[ ]` **End-to-End Test (Intern):** Ein kompletter Durchlauf von Phase 1 bis Phase 4 (inkl. echtem Deployment in n8n).

---

## Sprint 6: Security & Credentials (Der Türsteher)
*Ziel: Das System wasserdicht machen, bevor echte Nutzer ihre Daten eingeben.*
- `[ ]` **User Credentials & Workflows Tabellen:** `user_credentials` (für API-Keys) und `workflows` in Supabase anlegen.
- `[ ]` **Credential Collection UI:** Wenn der User in Phase 4 "Deploy" klickt, fragt das UI nach benötigten API-Keys/OAuth-Logins.
- `[ ]` **Verschlüsselung:** `lib/encryption.ts` mit AES-256-GCM erstellen. Alle API-Keys, die der Nutzer eingibt, werden im Frontend/Backend sofort verschlüsselt, bevor sie in der DB landen.
- `[ ]` **Row Level Security (RLS):** Striktes RLS aktivieren. Ein User darf **nur** auf `projects`, `messages`, `project_canvas` und `user_credentials` zugreifen, bei denen `user_id == auth.uid()` ist.
- `[ ]` **Security-Test (Intern):** Pen-Test der Auth-Routen. Kann User A auf das Projekt/die Credentials von User B zugreifen? (Muss fehlschlagen).

---

## Sprint 7: Alpha User Testing (Extern)
*Ziel: Validierung durch echte Testkunden in der sicheren Umgebung.*
- `[ ]` **Alpha-Invite:** 5–10 befreundete Unternehmer einladen.
- `[ ]` **Silent Observation:** Screen-Recording (z.B. Posthog) integrieren, um Hürden im UI/Chat zu identifizieren.
- `[ ]` **Feedback-Loop:** Post-Test Interviews durchführen und Mistral-Prompts anhand des echten Chat-Verhaltens optimieren.

---

## Sprint 8: Billing & Go-Live
*Ziel: Monetarisierung und Veröffentlichung.*
- `[ ]` **Stripe Integration:** Pricing-Modell aufsetzen, `app/api/stripe/checkout` Route und Webhook implementieren.
- `[ ]` **Paywall:** User müssen vor Phase 4 (dem echten Deployment) bezahlen.
- `[ ]` **Legal Prep:** Impressum, AGB, DSGVO (KI-Hinweise).
- `[ ]` **Go-Live:** Public Release (Marketing, Product Hunt, etc.).
