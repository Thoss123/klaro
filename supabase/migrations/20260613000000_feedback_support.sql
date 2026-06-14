-- Phasen-Feedback + Support-Meldungen.
--
-- phase_feedback: eine Zeile pro abgeschlossener Phase pro Projekt. Wird vom
-- Phasen-Feedback-Popup ("Wie hat es dir gefallen?") befüllt, sobald eine Phase
-- abgeschlossen ist (auch 'umsetzung' als Abschluss-Feedback). satisfaction +
-- helpfulness sind One-Click-Antworten, comment optionaler Freitext.
--
-- support_requests: Problem-Meldungen aus dem Hilfe-Button. category per
-- One-Click, message als Freitext; phase/session/url als Kontext für die Triage.

create table public.phase_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  user_id uuid,
  phase text,
  satisfaction text,
  helpfulness text,
  comment text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index phase_feedback_project_phase_idx on public.phase_feedback (project_id, phase);

alter table public.phase_feedback enable row level security;
create policy "Users can view own phase feedback"   on public.phase_feedback for select using (auth.uid() = user_id);
create policy "Users can create own phase feedback" on public.phase_feedback for insert with check (auth.uid() = user_id);
create policy "Users can update own phase feedback" on public.phase_feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id uuid references public.sessions(id) on delete set null,
  project_id uuid,
  phase text,
  category text,
  message text not null,
  url text,
  user_agent text,
  status text default 'open',
  created_at timestamp default now()
);

create index support_requests_user_idx on public.support_requests (user_id);
create index support_requests_status_idx on public.support_requests (status);

alter table public.support_requests enable row level security;
create policy "Users can view own support requests"   on public.support_requests for select using (auth.uid() = user_id);
create policy "Users can create own support requests" on public.support_requests for insert with check (auth.uid() = user_id);
