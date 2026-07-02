-- Warteliste: partielle und abgeschlossene Anmeldungen (auch bei Abbruch).
-- Zugriff nur über Server-API (Service Role), keine öffentlichen RLS-Policies.

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  email text,
  vorname text,
  firmenname text,
  telefon text,
  prozesse text,
  unternehmensgroesse text,
  tools text,
  step_reached int not null default 1,
  status text not null default 'partial'
    check (status in ('partial', 'completed', 'abandoned')),
  source text not null default 'landing',
  referrer text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index waitlist_signups_status_idx on public.waitlist_signups (status);
create index waitlist_signups_email_idx on public.waitlist_signups (email);
create index waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;
