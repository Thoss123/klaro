## Learned User Preferences

- Always communicate with the user in German (UI copy, explanations, and coach-facing text).
- Only create git commits when the user explicitly asks.
- Onboarding Ziel step is single-select; Hindernis step is multi-select.
- Phase 1 coach must not ask "typischer Tag" — use what they offer, then typischer Projektablauf.
- "Rundherum" questions (Verwaltung, Buchhaltung, Wissen, etc.) apply to all team sizes, including Solo.
- First coach message: Klaro intro → exact line "Lass uns gleich starten:" → first diagnostic question (Projektablauf in message 2).
- Coach questions should reference onboarding data ("Du hast ja angegeben …").
- Chat coach must not use markdown horizontal rules (---) or dialog prefixes ("Klaro:", "der Nutzer:").
- Phase 1 pacing: one question per message; after user answers, clarify with at most one Zwischenfrage if needed, then advance to the next script step in the next message — never bundle multiple script steps or questions in one reply.
- Phase 1 project flow: from customer acquisition (before first project contact) through to delivery; company facts go to canvas + session memory; phase transition uses a manual button (no auto-switch after summarize).
- Onboarding order: branche → … → rolle (mid-flow) → … → vorname + firmenname (steps 9–10, before auth).
- Phase 2: explicit A/B/C change appetite once, then implicit tool hints; terminal logs use `[agent-sync][canvas|memory][event]`.
- Phase 2 first message: recap only + first tool question — no Klaro re-intro or Phase 1 offer questions; hidden init uses phase-specific prompt via `lib/phase-welcome.ts`.

## Learned Workspace Facts

- This workspace is **Klaro** (Next.js AI automation coach for KMU), not the Innoweso project referenced in user rules.
- Klaro guides users through four phases: Diagnose → Analyse → Plan → Umsetzung, ending in automated n8n workflow deployment.
- Stack: Next.js App Router, Supabase (auth/data), Mistral for chat/canvas-worker, n8n for Phase 4 automation.
- System prompts and phase logic live in `lib/claude.ts`; chat API in `app/api/chat/route.ts`.
- Onboarding wizard is `components/onboarding/OnboardingWizard.tsx`; team sizes use codes `solo`, `small`, `medium`, `large`, `large_plus` via `lib/onboarding-labels.ts`.
- Multi-select onboarding values (e.g. Hindernis) are stored separated by ` · ` in `lib/onboarding-multi.ts`.
- `roadmap.md` is the single source of truth for launch planning.
