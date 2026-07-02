-- Warteliste: RLS deaktiviert — Zugriff nur über Server-API mit Anon/Service-Key.
-- Marketing-Leads, keine sensiblen Nutzerdaten; vermeidet RLS-Fehler in Production ohne Service-Role-Key.

alter table public.waitlist_signups disable row level security;

-- Falls Policies aus vorherigem Versuch existieren, entfernen.
drop policy if exists "Public can insert waitlist signup" on public.waitlist_signups;
drop policy if exists "Public can update waitlist signup" on public.waitlist_signups;
