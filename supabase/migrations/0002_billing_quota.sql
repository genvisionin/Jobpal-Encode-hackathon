-- Migration: billing + quota (Dodo Payments subscriptions + monthly usage).
--
-- Adds the `subscriptions` and `usage_counters` tables, the atomic
-- `increment_usage` RPC, and owner-only RLS. Idempotent (safe to run twice).
--
-- Apply with either:
--   • Supabase Dashboard → SQL Editor → paste this file → Run
--   • psql "postgresql://postgres.<ref>:<DB_PASSWORD>@aws-1-us-west-2.pooler.supabase.com:6543/postgres" -f this_file

-- One subscription row per user.
create table if not exists public.subscriptions (
  user_id              text primary key,
  plan                 text not null default 'free',
  status               text not null default 'active',
  dodo_customer_id     text,
  dodo_subscription_id text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_dodo_sub_idx
  on public.subscriptions (dodo_subscription_id);

-- Monthly metered usage counters.
create table if not exists public.usage_counters (
  user_id     text not null,
  metric      text not null,
  period      text not null,
  count       int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, metric, period)
);

-- Atomic increment (upsert + add) used by the quota system.
create or replace function public.increment_usage(
  p_user_id text, p_metric text, p_period text, p_delta int
) returns table (count int)
language plpgsql
as $$
begin
  insert into public.usage_counters as u (user_id, metric, period, count, updated_at)
  values (p_user_id, p_metric, p_period, greatest(p_delta, 0), now())
  on conflict (user_id, metric, period)
  do update set count = u.count + p_delta, updated_at = now();

  return query
    select u.count from public.usage_counters u
    where u.user_id = p_user_id and u.metric = p_metric and u.period = p_period;
end;
$$;

-- Owner-only RLS (service role bypasses).
alter table public.subscriptions  enable row level security;
alter table public.usage_counters enable row level security;

do $$
declare t text;
begin
  foreach t in array array['subscriptions','usage_counters'] loop
    execute format('drop policy if exists "owner_all" on public.%I;', t);
    execute format(
      'create policy "owner_all" on public.%I for all
         using (auth.uid()::text = user_id)
         with check (auth.uid()::text = user_id);', t);
  end loop;
end $$;

-- Refresh PostgREST's schema cache so the API sees the new tables/RPC at once.
notify pgrst, 'reload schema';
