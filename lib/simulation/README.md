# Coaching Simulation Harness

Test the 4-phase coaching flow with an **AI-played customer** instead of waiting
for real ones. It's **nothing but a custom skill + code**: Claude Code starts the
run, Mistral plays the customer against the real Mistral coach, and **Claude Code
(Opus) judges the transcript itself** — there is no LLM judge API call.

```
            ┌──────────── Claude Code runs the /simulate-coaching skill ───────────┐
            │                                                                       │
persona (Mistral) → real coach (/api/chat, Mistral) → mechanical checks (code)      │
            │                                   │                                   │
            │                              JudgePacket → Claude Code reads & judges ─┘
            └──── re-run same persona to verify ◄── Claude proposes prompt fix
```

## The three roles (why it catches real mistakes)

1. **Customer** — `persona-agent.ts`. A Mistral persona role-plays a realistic
   business owner from a seed profile + behaviour knobs (vague, off-topic,
   skeptical, (non)technical). Defined in `personas.ts` (`profil-1/2/3`).
2. **Coach** — your real, untouched `/api/chat` (Mistral). The driver
   (`driver.ts`) reproduces the browser's orchestration loop headless: stream the
   reply, parse `<phase_complete>` / `<trigger_canvas_update>` / `<workflow_plan>`
   tags, run the canvas worker, snapshot a checkpoint per phase.
3. **Judge = Claude Code (Opus)** — split in two:
   - **Mechanical** (deterministic code, `rules.ts`): reuses the *production*
     validators (`validateWorkflowStructure`, pain-point coverage, tool capture,
     ID leaks). The "is it practical?" half — nothing can soften it.
   - **Rubric** (Claude Code): the code hands Claude a `JudgePacket` (transcript +
     rubric rules + ground truth); Claude reads it and returns a pass/fail + quote
     per rule, then posts it back. The rubric encodes the team's feedback memories
     (cost framing, chat hygiene, Phase-2 tool questions, Phase-3 over-branching,
     filtering impractical ideas).

> No Mistral-grades-Mistral problem: the only model the harness *calls* is the
> persona. The judge is Claude Code, invoked via the `/simulate-coaching` skill.

## Run it

The intended entry point is the **`/simulate-coaching` skill** — just ask Claude
Code to "run a coaching simulation with profil-2" and it does the whole loop
(start → read packet → judge → record → report). See
`.claude/skills/simulate-coaching/SKILL.md`.

Under the hood it's three CLI steps (dev server running, `MISTRAL_API_KEY` +
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`):

```bash
node scripts/simulate.mjs --seed                          # upsert seed personas (once)
node scripts/simulate.mjs --persona profil-2              # 1. Mistral simulates → writes JudgePacket file
#   Claude Code reads the packet, judges the rubric, writes verdict.json …
node scripts/simulate.mjs --judge <runId> --findings verdict.json   # 2. record Claude's verdict
node scripts/simulate.mjs --resume <runId> --after analyse          # redo phase 3 only
node scripts/simulate.mjs --aggregate                               # build the improvement report
```

Browse runs and transcripts at **`/dev/simulations`**.

## Open a run in the real chat UI (and continue it by hand)

The dev viewer is read-only. To actually keep chatting where a simulation left
off, import the run into a real chat session for a localhost test user:

```bash
node scripts/simulate.mjs --import <runId>     # → prints /chat?id=<sessionId>
```

It creates a project + session + messages + canvas under `SIM_TEST_USER_ID`
(service-role write; the session is stamped with that user so RLS lets them read
and keep writing). Log in as the test account on localhost, open the printed
URL, and continue the conversation as a normal user.

## Resume (the "redo phase 3 only" feature)

Every phase boundary writes a `sim_checkpoints` row: the full message array +
canvas + onboarding at that point. `--resume <runId> --after analyse` loads the
end-of-Phase-2 checkpoint and only re-simulates `plan` onward — so iterating on
the Phase-3 prompt doesn't pay for re-running Phases 1–2.

## Self-improvement loop

1. Run a persona → findings land in `sim_findings`.
2. `npm run sim -- --aggregate` clusters failures by rule into
   `sim_improvements`, each with a concrete `proposed_change` + the prompt it
   targets (`diagnose|analyse|plan|umsetzung|shared`).
3. **A human / Claude Code edits the prompt** (intentionally not automated —
   the coach's core prompts stay under review).
4. Re-run the *same* persona, then `verifyImprovement()` compares the targeted
   rule before/after and marks it `verified` or `rejected`.

## Data model (`sim_*`, dev-only, RLS-locked to service role)

| Table | Holds |
|-------|-------|
| `sim_personas` | seed customers |
| `sim_runs` | one run + rolled-up verdict |
| `sim_checkpoints` | per-phase conversation snapshot (resume backbone) |
| `sim_messages` | flattened transcript for the viewer |
| `sim_findings` | per-rule judge results |
| `sim_improvements` | aggregated fixes + verification |

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `SIM_PERSONA_MODEL` | `mistral-large-latest` | the customer model (the only model the harness calls) |
| `SIM_BASE_URL` | `http://localhost:3000` | server the CLI hits |
| `SIM_TEST_USER_ID` | unset | localhost test user that `--import` writes the chat session to |
| `ENABLE_SIM_DEV` | unset | set `true` to allow the dev routes in production |

The judge is Claude Code itself — no judge model/env.

## Limitations

- The driver reproduces the client orchestration; it is faithful but not a
  byte-for-byte copy of `app/chat/page.tsx`. If that loop changes materially,
  update `driver.ts`.
- `workflow_plan` blocks are folded into the canvas locally for validation
  rather than round-tripping through `create-plan` (no real project exists in a
  simulation).
- A full run makes many Mistral calls — it costs real tokens. Use `--phases` and
  `--resume` to keep iterations cheap.
