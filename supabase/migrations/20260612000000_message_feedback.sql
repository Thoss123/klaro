-- Message-Feedback (Daumen hoch/runter) mit Kontext für spätere AI-Auswertung.
-- context = die letzten 5 sichtbaren Chat-Nachrichten (role + content) zum
-- Zeitpunkt des Ratings; problem/comment kommen aus dem Umfrage-Popup und
-- werden nachträglich auf derselben Zeile ergänzt.

create table public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid,
  message_id text,
  rating text not null check (rating in ('up', 'down')),
  phase text,
  context jsonb default '[]',
  problem text,
  comment text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index message_feedback_session_idx on public.message_feedback (session_id);

alter table public.message_feedback enable row level security;
create policy "Users can view own feedback"   on public.message_feedback for select using (auth.uid() = user_id);
create policy "Users can create own feedback" on public.message_feedback for insert with check (auth.uid() = user_id);
create policy "Users can update own feedback" on public.message_feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
