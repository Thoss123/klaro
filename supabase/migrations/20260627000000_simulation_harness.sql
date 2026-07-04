-- Simulation harness: AI-driven testing of the 4-phase coaching flow.
--
-- A "synthetic customer" (persona) is driven against the real /api/chat coach,
-- the run is judged (mechanical + rubric), and findings feed a self-improvement
-- loop. These tables are dev/admin-only: RLS is ON with no public policy, so
-- only the service-role client (scripts + dev API routes) can read/write them.

-- ── Personas: the synthetic customers ("Profil 1/2/3 …") ────────────────────
create table if not exists public.sim_personas (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,              -- "profil-1", referenced from the CLI
  label       text not null,
  -- onboarding seed handed to /api/chat verbatim (branche, größe, ziel, …)
  onboarding  jsonb not null,
  -- behaviour profile for the persona LLM (vagueness, pushiness, tech-literacy …)
  behavior    jsonb not null default '{}'::jsonb,
  -- ground-truth the judge can check the run against (pain points that *should*
  -- surface, tools the customer uses, automations that are/aren't realistic).
  ground_truth jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Runs: one execution of one persona through some phases ───────────────────
create table if not exists public.sim_runs (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid references public.sim_personas(id) on delete set null,
  persona_slug  text not null,
  label         text,
  status        text not null default 'running',   -- running | done | failed
  -- which phases this run actually executed (resume runs only re-run a subset)
  phases_run    text[] not null default '{}',
  -- if this run resumed from a checkpoint of an earlier run
  resumed_from_run_id uuid references public.sim_runs(id) on delete set null,
  resumed_from_phase  text,
  coach_model   text,
  judge_model   text,
  -- rolled-up verdict { score, pass, by_severity, by_rule }
  verdict       jsonb,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists sim_runs_persona_idx on public.sim_runs(persona_slug, started_at desc);
create index if not exists sim_runs_status_idx  on public.sim_runs(status);

-- ── Phase checkpoints: full conversation state at each phase boundary ────────
-- This is the backbone of "phase 1 & 2 didn't change — just redo phase 3":
-- a resume run loads the checkpoint at the end of the desired phase and
-- continues from there.
create table if not exists public.sim_checkpoints (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.sim_runs(id) on delete cascade,
  -- phase that JUST COMPLETED when this snapshot was taken
  phase       text not null,
  -- the full message array as /api/chat would receive it next turn
  messages    jsonb not null,
  -- canvas state at this boundary
  canvas      jsonb not null,
  onboarding  jsonb not null,
  created_at  timestamptz not null default now(),
  unique (run_id, phase)
);

-- ── Messages: flattened transcript for the dev viewer ───────────────────────
create table if not exists public.sim_messages (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.sim_runs(id) on delete cascade,
  turn        int not null,
  phase       text not null,
  role        text not null,                      -- 'customer' | 'coach'
  -- what the user/coach actually saw (internal tags stripped for 'coach')
  content     text not null,
  -- raw coach output incl. tags, for debugging (null for customer turns)
  raw         text,
  -- side-effects detected this turn: phase_complete, trigger_canvas_update, …
  signals     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists sim_messages_run_idx on public.sim_messages(run_id, turn);

-- ── Findings: one judged issue (mechanical or rubric) ───────────────────────
create table if not exists public.sim_findings (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.sim_runs(id) on delete cascade,
  rule_id     text not null,                      -- stable id, e.g. "no-internal-ids"
  kind        text not null,                      -- 'mechanical' | 'rubric'
  phase       text,
  passed      boolean not null,
  severity    text not null default 'info',       -- info | low | medium | high | critical
  message     text not null,
  -- the offending coach quote (rubric) or validator detail (mechanical)
  evidence    text,
  -- which phase prompt to change + how (the seed of the improvement loop)
  suggested_fix text,
  created_at  timestamptz not null default now()
);

create index if not exists sim_findings_run_idx  on public.sim_findings(run_id);
create index if not exists sim_findings_rule_idx on public.sim_findings(rule_id, passed);

-- ── Improvements: aggregated findings → a proposed prompt change, then verified
create table if not exists public.sim_improvements (
  id            uuid primary key default gen_random_uuid(),
  rule_id       text not null,
  title         text not null,
  -- which phase prompt this targets (diagnose|analyse|plan|umsetzung|shared)
  target_prompt text not null,
  -- how often the rule failed across the runs this aggregation covered
  fail_count    int not null default 0,
  run_count     int not null default 0,
  example_quotes jsonb not null default '[]'::jsonb,
  proposed_change text not null,
  status        text not null default 'open',     -- open | applied | verified | rejected
  -- verification: the run that re-tested the same persona after the fix
  verified_by_run_id uuid references public.sim_runs(id) on delete set null,
  -- delta vs. the baseline run for the targeted rule (e.g. "3 fails → 0 fails")
  verification_note  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sim_improvements_status_idx on public.sim_improvements(status, rule_id);

-- ── RLS: dev/admin tables — lock out anon/auth entirely, service-role only ──
alter table public.sim_personas     enable row level security;
alter table public.sim_runs         enable row level security;
alter table public.sim_checkpoints  enable row level security;
alter table public.sim_messages     enable row level security;
alter table public.sim_findings     enable row level security;
alter table public.sim_improvements enable row level security;
-- No policies = no access for anon/authenticated. The service-role key (used by
-- scripts and the dev API routes) bypasses RLS, which is exactly the intent.
