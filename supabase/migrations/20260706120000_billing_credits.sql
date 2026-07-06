-- Testphase billing: one credit balance per user, token-cost based ledger.

create table if not exists public.user_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_balance integer not null default 2000 check (credits_balance >= 0),
  credits_lifetime_granted integer not null default 2000 check (credits_lifetime_granted >= 0),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  action text not null,
  credits integer not null,
  balance_after integer,
  api_cost_eur numeric(10, 6),
  input_tokens integer,
  output_tokens integer,
  model text,
  stripe_event_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created
  on public.credit_ledger(user_id, created_at desc);

create unique index if not exists credit_ledger_stripe_event_unique
  on public.credit_ledger(stripe_event_id)
  where stripe_event_id is not null;

alter table public.user_billing enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "Users can read own billing" on public.user_billing;
create policy "Users can read own billing"
  on public.user_billing
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own credit ledger" on public.credit_ledger;
create policy "Users can read own credit ledger"
  on public.credit_ledger
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.user_billing to authenticated;
grant select on public.credit_ledger to authenticated;

create or replace function public.debit_user_credits(
  p_user_id uuid,
  p_credits integer,
  p_action text,
  p_project_id uuid default null,
  p_session_id uuid default null,
  p_api_cost_eur numeric default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_model text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  credits_balance integer,
  ledger_id uuid
)
language plpgsql
as $$
declare
  v_balance integer;
  v_ledger_id uuid;
begin
  if p_credits <= 0 then
    raise exception 'credits must be positive';
  end if;

  insert into public.user_billing (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select ub.credits_balance
    into v_balance
  from public.user_billing ub
  where ub.user_id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'billing row not found';
  end if;

  if v_balance < p_credits then
    raise exception 'insufficient credits';
  end if;

  update public.user_billing
  set credits_balance = public.user_billing.credits_balance - p_credits,
      updated_at = now()
  where user_id = p_user_id
  returning user_billing.credits_balance into v_balance;

  insert into public.credit_ledger (
    user_id,
    project_id,
    session_id,
    action,
    credits,
    balance_after,
    api_cost_eur,
    input_tokens,
    output_tokens,
    model,
    metadata
  )
  values (
    p_user_id,
    p_project_id,
    p_session_id,
    p_action,
    -p_credits,
    v_balance,
    p_api_cost_eur,
    p_input_tokens,
    p_output_tokens,
    p_model,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  return query select v_balance, v_ledger_id;
end;
$$;

create or replace function public.grant_user_credits(
  p_user_id uuid,
  p_credits integer,
  p_action text default 'grant',
  p_stripe_event_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  credits_balance integer,
  ledger_id uuid
)
language plpgsql
as $$
declare
  v_balance integer;
  v_ledger_id uuid;
begin
  if p_credits <= 0 then
    raise exception 'credits must be positive';
  end if;

  insert into public.user_billing (user_id, credits_balance, credits_lifetime_granted)
  values (p_user_id, 2000 + p_credits, 2000 + p_credits)
  on conflict (user_id) do update
    set credits_balance = public.user_billing.credits_balance + p_credits,
        credits_lifetime_granted = public.user_billing.credits_lifetime_granted + p_credits,
        updated_at = now()
  returning user_billing.credits_balance into v_balance;

  insert into public.credit_ledger (
    user_id,
    action,
    credits,
    balance_after,
    stripe_event_id,
    metadata
  )
  values (
    p_user_id,
    p_action,
    p_credits,
    v_balance,
    p_stripe_event_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  return query select v_balance, v_ledger_id;
end;
$$;

revoke all on function public.debit_user_credits(uuid, integer, text, uuid, uuid, numeric, integer, integer, text, jsonb) from public;
revoke all on function public.grant_user_credits(uuid, integer, text, text, jsonb) from public;
grant execute on function public.debit_user_credits(uuid, integer, text, uuid, uuid, numeric, integer, integer, text, jsonb) to service_role;
grant execute on function public.grant_user_credits(uuid, integer, text, text, jsonb) to service_role;

