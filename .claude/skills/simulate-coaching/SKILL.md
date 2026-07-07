---
name: simulate-coaching
description: Test the Axantilo 3-phase coaching flow (diagnose → analyse → umsetzung) with an AI-played customer and judge the result. Use when asked to simulate/test the coach, run a coaching simulation, test a persona/profile (profil-1..4, immomakler-1..4), re-test a phase, or check whether the phases still work after a prompt change. Claude Code starts the run (Mistral plays the customer + the real coach), then judges the transcript itself.
---

# Simulate & judge the coaching flow

You (Claude Code / Opus) ARE the judge. The code runs a Mistral customer against
the real Mistral coach and does the deterministic checks; **you read the
transcript and judge the rubric.** No LLM judge is called — that's the point.

**Struktur wie in echt:** 3 Phasen — `diagnose` → `analyse` (Analyse & Plan
gemergt) → `umsetzung`. Wie in der App startet der COACH mit der Begrüßung
(erste Nachricht von Axantilo), dann geführtes Gespräch; die interne Strategie
wird aus den Onboarding-Daten der Persona vorab generiert und mitgegeben.
Personas: `profil-1..4` (verschiedene Branchen) und `immomakler-1..4`
(Immobilienmakler mit verschiedenen Einwänden/Situationen: Kontrollverlust,
Datenschutz, konkrete Ideen/technik-affin, Kosten/Zeit).

## Preconditions
- The dev server must be running (`npm run dev`). If a run fails with a connection
  error, tell the user to start it. The driver hits `${SIM_BASE_URL:-http://localhost:3000}/api/chat`.
- `MISTRAL_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must be in `.env.local`.
- First time only: `node scripts/simulate.mjs --seed` (upserts all personas).
- The migration `supabase/migrations/20260627000000_simulation_harness.sql` must be applied (`npm run db:push`).

## Procedure

1. **Pick the persona / scope** from the user's request:
   - full run: `node scripts/simulate.mjs --persona immomakler-2-datenschutz`
   - phase subset: `... --persona immomakler-1-kontrolle --phases diagnose,analyse`
   - resume (diagnose unchanged, redo analyse+): `... --resume <runId> --after diagnose`
     (der Persona-Slug wird beim Resume aus dem Ursprungslauf abgeleitet)

2. **Run it.** This is the Mistral simulation; it can take minutes. It prints a
   `JUDGE PACKET written to: <path>` line and the `runId`.

3. **Read the packet file** (the path from step 2). It contains:
   - `transcript` — the full customer/coach dialogue per phase
   - `rubricRules` — the rules YOU must judge (id, guidance, severity, targetPrompt)
   - `mechanicalFindings` — already decided by code; do NOT re-judge these
   - `groundTruth` — what's realistic/impractical for this customer

4. **Judge the rubric.** For EACH rule in `rubricRules`, read the coach's turns and
   decide pass/fail per its `guidance`. Be strict — when in doubt, FAIL. On a fail,
   quote the offending coach line verbatim as `evidence`. Build a JSON array:
   ```json
   [
     { "ruleId": "cost-not-disadvantage", "passed": false, "severity": "high",
       "message": "Coach framed the monthly cost as a downside.",
       "evidence": "Das kostet dich aber leider 200€ im Monat …",
       "suggestedFix": "Phase prompt: always frame cost as an investment that the saved time earns back." },
     { "ruleId": "no-redundant-questions", "passed": true, "message": "No redundant questions." }
   ]
   ```
   Return one entry per rule. Write the array to a temp file (use the scratchpad dir).

5. **Record your verdict:**
   `node scripts/simulate.mjs --judge <runId> --findings <your-verdict.json>`
   This combines your rubric verdicts with the mechanical findings, scores the run
   and finalizes it.

6. **Report to the user:** the score + pass/fail, the failed findings (mechanical
   AND your rubric ones) with quotes, any `stalled` phases, and the viewer link
   `/dev/simulations/<runId>`.

7. **(Optional) Open it in the real chat UI to continue by hand:**
   `node scripts/simulate.mjs --import <runId>` imports the run into a real chat
   session for the localhost test user (`SIM_TEST_USER_ID`) and prints
   `/chat?id=<sessionId>`. The user logs in as the test account and can keep
   chatting where the simulation left off. Read-only viewing is `/dev/simulations/<runId>`.

## Self-improvement loop
When the user wants to act on recurring failures:
- `node scripts/simulate.mjs --aggregate` clusters failures across recent runs into
  `sim_improvements`, each naming the prompt to change (`diagnose|analyse|umsetzung|shared`) and a proposed change.
- Apply the prompt edit yourself (this is the human/Claude-gated step — don't auto-edit prompts without surfacing the change).
- Re-run the SAME persona, then verify the targeted rule flipped FAIL→pass via the
  `/api/dev/simulations/improve` route (`action: "verify"`).

## Rubric rules (judge against these — also delivered in the packet)
- **cost-not-disadvantage** (high): cost is always an investment that saved time earns back, never a drawback/"Haken".
- **no-redundant-questions** (medium): never re-ask onboarding/canvas facts; no abstract/vague questions.
- **phase2-tools-strict** (medium): the merged analyse asks the customer's tools strictly per pain point; never pitches Axantilo's own tools.
- **phase3-fewer-paths** (low): the solution-design part of analyse doesn't branch into trivial implementation details; option count matches the customer's tempo.
- **impractical-filtered** (high): coach coldly filters out ideas that aren't practical for this customer instead of building everything.
- **realistic-automations** (medium): proposals are doable with the customer's actual tool stack/team.

## Notes
- Costs real Mistral tokens per run — prefer `--phases` / `--resume` while iterating.
- The coach is the REAL `/api/chat`, so this exercises the actual phase prompts.
- Mechanical findings (workflow validity, pain-point coverage, tool capture, ID leaks) are deterministic — trust them as hard correctness.
