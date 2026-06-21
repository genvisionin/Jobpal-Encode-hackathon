-- Migration: subscription user enrichment + admin visibility.
--
-- Problems addressed:
--   1. Free users with no paid history had no row in `subscriptions` at all,
--      making it impossible to count or filter all users from that table.
--   2. `subscriptions` had no user-identifying info (email / name) — you had
--      to join auth.users manually.
--   3. No `created_at` column, so the original subscription date was lost.
--
-- What this adds:
--   a. `created_at` column on subscriptions (when the row was first created).
--   b. A trigger that auto-inserts a plan='free' row in `subscriptions` the
--      moment any user signs up, so every user is always represented.
--   c. A backfill for existing users who don't have a row yet.
--   d. `admin_subscriptions` view — joins auth.users + subscriptions so you
--      can see user_id, email, name, plan, status, signup date, and billing
--      IDs all in one place from the Supabase dashboard.
--
-- Idempotent (safe to run more than once).
--
-- Apply via:
--   Supabase Dashboard → SQL Editor → paste this file → Run

-- ── 1. Add created_at to subscriptions ─────────────────────────────────────

alter table public.subscriptions
  add column if not exists created_at timestamptz not null default now();

-- Backfill created_at for existing rows (set to updated_at as best estimate).
update public.subscriptions
  set created_at = updated_at
  where created_at = now()  -- only rows just defaulted, not ones already set
    and updated_at < now();

-- ── 2. Trigger: auto-create a free subscription row on user signup ──────────

create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan, status, created_at, updated_at)
  values (new.id::text, 'free', 'active', now(), now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute procedure public.handle_new_user_subscription();

-- ── 3. Backfill: create free rows for any existing users missing a row ──────

insert into public.subscriptions (user_id, plan, status, created_at, updated_at)
select
  u.id::text,
  'free',
  'active',
  u.created_at,
  now()
from auth.users u
where u.id::text not in (select user_id from public.subscriptions)
on conflict (user_id) do nothing;

-- ── 4. Admin view: subscriptions + auth.users joined ───────────────────────
--
-- Query this from the Supabase SQL editor (or your admin panel via service
-- role) to see every user alongside their plan and billing details.
-- Columns:
--   user_id              — Supabase auth UUID
--   user_email           — sign-in email
--   user_name            — display name from OAuth meta or email prefix
--   signed_up_at         — when the auth account was created
--   plan                 — free | pro | premium
--   status               — active | on_hold | cancelled | expired | failed
--   subscription_since   — when this subscription row was first created
--   current_period_end   — paid plan expiry date (null for free)
--   cancel_at_period_end — user has requested cancellation but still active
--   dodo_customer_id     — Dodo Payments customer id (cus_…)
--   dodo_subscription_id — Dodo Payments subscription id (sub_…)
--   subscription_updated — last time the subscription row changed

create or replace view public.admin_subscriptions as
select
  u.id::text                                            as user_id,
  u.email                                               as user_email,
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'display_name',
    split_part(u.email, '@', 1)
  )                                                     as user_name,
  u.created_at                                          as signed_up_at,
  coalesce(s.plan,   'free')                            as plan,
  coalesce(s.status, 'active')                          as status,
  s.created_at                                          as subscription_since,
  s.current_period_end,
  coalesce(s.cancel_at_period_end, false)               as cancel_at_period_end,
  s.dodo_customer_id,
  s.dodo_subscription_id,
  s.updated_at                                          as subscription_updated
from auth.users u
left join public.subscriptions s on s.user_id = u.id::text
order by u.created_at desc;

-- Tell PostgREST to pick up the new column + view immediately.
notify pgrst, 'reload schema';
