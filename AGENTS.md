## Learned User Preferences

- Always communicate with the user in German (UI copy, explanations, and coach-facing text).
- Only create git commits when the user explicitly asks.
- Onboarding: Ziel single-select; Hindernis multi-select; order branche → … → rolle (mid-flow) → … → vorname + firmenname (steps 9–10, before auth).
- Phase 1 coach: no „typischer Tag“; offer type then Projektablauf (customer acquisition → delivery); company facts → canvas + session memory; intro → „Lass uns gleich starten:“ → first diagnostic question in message 2; reference onboarding; one question per message, max one Zwischenfrage before next script step.
- „Rundherum“ questions (Verwaltung, Buchhaltung, Wissen, etc.) for all team sizes including Solo.
- Chat coach: no markdown `---` or dialog prefixes; assistant replies plain text on white background; no meta lines like „Ich frag nur das, was ich noch nicht weiß…“.
- Phase transition: manual button after summarize; phases 2+ via hidden init from `lib/phase-welcome.ts` / `lib/session-kickoff.ts` — never Phase 1 onboarding intro on phase switch or empty session.
- Phase 2: recap + explicit A/B/C change appetite once, then tool questions per pain point; implicit automation hints; Umsetzer profile at end; no duplicate tool summaries; canvas use_cases = status quo only.
- Phase 3: gap-fill from prior phases — minimize re-interview/writing; use change_appetite from Phase 2 ({{company}}), do not re-ask A/B/C; update existing workflows on change requests, not new ones; human-in-the-loop before posting/strategic steps.
- Phase 4: open with prepared workflows („Workflows 1–3 bereit — deploy?“) — no re-interview, no A/B/C, no tool re-discovery; execution only.
- Never refactor `RoadmapCanvas` curved path, phase checkpoints, or side PhaseNode TitleBox — only content rails, card placement, and doc-first dedup.
- Canvas/memory blobs only facts from the conversation — no speculation or invented fields; terminal logs use `[agent-sync][canvas|memory][event]`.

## Learned Workspace Facts

- This workspace is **Klaro** (Next.js AI automation coach for KMU), not the Innoweso project referenced in user rules.
- Klaro guides users through four phases: Diagnose → Analyse → Plan → Umsetzung; Phase 4 deploys n8n workflows from Phase 3 canvas plans.
- Stack: Next.js App Router, Supabase (auth/data), Mistral for chat/canvas-worker; Sprint 2 targets n8n API on Hostinger-hosted instance.
- System prompts and phase logic live in `lib/claude.ts`; chat API in `app/api/chat/route.ts`; phase kickoff in `lib/phase-welcome.ts` and `lib/session-kickoff.ts`.
- Chat `sessionPhase` follows the active session; `project_canvas` holds cross-phase blobs — do not conflate session phase with canvas progress phase.
- Onboarding wizard is `components/onboarding/OnboardingWizard.tsx`; team sizes use codes `solo`, `small`, `medium`, `large`, `large_plus` via `lib/onboarding-labels.ts`; multi-select values (e.g. Hindernis) stored separated by ` · ` in `lib/onboarding-multi.ts`.
- Canvas UI is `components/canvas/RoadmapCanvas.tsx`: frozen curved SVG line + side TitleBox at PhaseNode; mutable `ContentRail` cards centered at node (`-translate-y-1/2` when canvas ≥ ~720px, else below checkpoint); doc-first dedup hides redundant blobs when phase documents cover the topic (`inferDocumentPhase` in `lib/canvas-normalize.ts`).
- Canvas worker (`app/api/canvas-worker/route.ts`) normalizes via `lib/canvas-normalize.ts`; workflows only in plan/umsetzung; implementer only in analyse; tools filtered against user chat.
- Chat file uploads use `app/api/attachments/route.ts` → Supabase bucket `chat-uploads`; hidden kickoff messages use `lib/hidden-chat.ts`.
- Prompt strings: closing XML tags via `END_*` constants in `lib/claude.ts` — literal `</` in template literals breaks Turbopack.
- Chat client (`app/chat/page.tsx`) must check `response.ok` before displaying the body — API HTML errors must not render as coach text.
- `roadmap.md` is SSOT for launch planning; v1.1+ = Sprint 3 agent orchestration (`lib/agent-orchestration.ts`: Supervisor, Workflow QA, Topic Research); Sprint 4 includes voice mode; Coach Advisor is v1.2+ backlog — Supervisor aligns canvas/workflow topic, not proactive coach steering.
