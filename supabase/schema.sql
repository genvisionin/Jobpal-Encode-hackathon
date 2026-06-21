-- Reframe — Supabase schema (production: auth + multi-user)
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- user_id stores the authenticated user's uuid (as text). All server access
-- goes through the service-role key (which bypasses RLS) with explicit
-- per-user filtering in code; RLS below is defense-in-depth so a leaked anon
-- key can never read another user's rows.

-- ======================================================================
-- Customize CV
-- ======================================================================

-- The master profile (one per user).
create table if not exists public.profiles (
  user_id            text primary key,
  resume             jsonb not null default '{}'::jsonb,
  insights           jsonb not null default '{}'::jsonb,  -- derived career intelligence
  source             text  not null default 'builder',  -- upload | builder
  source_file_key    text,
  source_file_name   text,
  updated_at         timestamptz not null default now()
);
-- Back-compat for existing deployments:
alter table public.profiles add column if not exists insights jsonb not null default '{}'::jsonb;

-- Generated, job-tailored CVs (many per user).
create table if not exists public.tailored_cvs (
  id                  text primary key,
  user_id             text not null,
  company             text not null default '',
  role                text not null default '',
  template_id         text not null default 'modern-serif',
  resume              jsonb not null default '{}'::jsonb,
  job                 jsonb not null default '{}'::jsonb,
  archetype           text,
  archetype_rationale text,
  match_score         int  not null default 0,
  score_breakdown     jsonb not null default '[]'::jsonb,
  requirement_matches jsonb not null default '[]'::jsonb,
  customization_plan  jsonb not null default '[]'::jsonb,
  changes             jsonb not null default '[]'::jsonb,
  keyword_coverage    jsonb not null default '[]'::jsonb,
  cover_letter        jsonb,
  created_at          timestamptz not null default now()
);
-- Back-compat for existing deployments:
alter table public.tailored_cvs add column if not exists archetype text;
alter table public.tailored_cvs add column if not exists archetype_rationale text;
alter table public.tailored_cvs add column if not exists score_breakdown jsonb not null default '[]'::jsonb;
alter table public.tailored_cvs add column if not exists requirement_matches jsonb not null default '[]'::jsonb;
alter table public.tailored_cvs add column if not exists customization_plan jsonb not null default '[]'::jsonb;
alter table public.tailored_cvs add column if not exists cover_letter jsonb;

create index if not exists tailored_cvs_user_idx
  on public.tailored_cvs (user_id, created_at desc);

-- ======================================================================
-- Gmail application tracker
-- ======================================================================

-- The user's Gmail connection. Tokens are server-only; never expose them.
create table if not exists public.tracker_connections (
  user_id           text primary key,
  email             text not null,
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  connected_at      timestamptz not null default now(),  -- "day X"
  last_synced_at    timestamptz,
  sync_cursor       text,
  status            text not null default 'connected'    -- connected | disconnected | error
);

-- De-duplicated applications, auto-maintained from the inbox.
create table if not exists public.tracked_applications (
  id              text primary key,
  user_id         text not null,
  company         text not null default '',
  company_key     text not null default '',  -- normalized for matching
  role            text not null default '',
  stage           int  not null default 0,   -- 0 Applied,1 In review,2 Interview,3 Decision
  outcome         text,                       -- offer | rejected | null
  needs_action    boolean not null default false,
  action_summary  text,
  action_due_at   timestamptz,
  notes           text,
  job_url         text,
  contact_name    text,
  contact_email   text,
  latest_email_id text,
  latest_thread_id text,
  applied_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  source          text not null default 'gmail'
);

create index if not exists tracked_applications_user_idx
  on public.tracked_applications (user_id, updated_at desc);
create index if not exists tracked_applications_key_idx
  on public.tracked_applications (user_id, company_key);

-- Audit log of every ingested email (idempotency + re-linking).
-- The primary key is the provider message id, so re-syncs never duplicate.
create table if not exists public.email_events (
  id              text primary key,           -- gmail message id
  user_id         text not null,
  application_id  text references public.tracked_applications(id) on delete set null,
  thread_id       text,
  kind            text not null,
  company         text not null default '',
  role            text not null default '',
  received_at     timestamptz not null,
  event_date      timestamptz,
  summary         text not null default '',
  confidence      real not null default 0
);

create index if not exists email_events_user_idx
  on public.email_events (user_id, received_at desc);

-- Auto-generated interview prep packs. One row per application (1:1), upserted
-- on (user_id, application_id). The brief itself is stored as JSONB.
create table if not exists public.interview_preps (
  id              text primary key,
  user_id         text not null,
  application_id  text not null,
  company         text not null default '',
  role            text not null default '',
  prep            jsonb not null default '{}'::jsonb,
  source          text not null default 'azure',   -- azure | mock
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, application_id)
);

create index if not exists interview_preps_user_idx
  on public.interview_preps (user_id, updated_at desc);

-- ======================================================================
-- Chrome extension auth
-- ======================================================================

-- Short-lived one-time codes created by /extension-auth/start and exchanged
-- by the extension for extension-only tokens. Codes are SHA-256 hashed.
create table if not exists public.extension_auth_codes (
  code_hash    text primary key,
  user_id      text not null,
  extension_id text not null,
  redirect_uri text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  used_at      timestamptz
);

create index if not exists extension_auth_codes_user_idx
  on public.extension_auth_codes (user_id, created_at desc);

-- Extension-only sessions. Raw access/refresh tokens are never stored.
create table if not exists public.extension_sessions (
  id                 text primary key,
  user_id            text not null,
  extension_id       text not null,
  access_token_hash  text not null unique,
  refresh_token_hash text not null unique,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz not null default now(),
  revoked_at         timestamptz
);

create index if not exists extension_sessions_user_idx
  on public.extension_sessions (user_id, last_used_at desc);
create index if not exists extension_sessions_refresh_idx
  on public.extension_sessions (refresh_token_hash);

-- User-confirmed answers for repeated extension questions. Flexible answer
-- payloads live in native Postgres jsonb while stable lookup keys remain
-- relational.
create table if not exists public.extension_field_memories (
  id                  text primary key,
  user_id             text not null,
  question_key        text not null,
  normalized_question text not null,
  field_kind          text not null,
  answer              jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  capture_count       integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, question_key)
);

create index if not exists extension_field_memories_user_idx
  on public.extension_field_memories (user_id, updated_at desc);
create index if not exists extension_field_memories_question_idx
  on public.extension_field_memories (user_id, question_key);
create index if not exists extension_field_memories_answer_gin_idx
  on public.extension_field_memories using gin (answer);
create index if not exists extension_field_memories_metadata_gin_idx
  on public.extension_field_memories using gin (metadata);

-- LLM-refined profile enrichment derived from user-confirmed captured answers
-- plus the saved resume/profile. Atomic captured answers remain the source of
-- truth; this table is the compact context used by Magic Fill.
create table if not exists public.user_profile_enrichments (
  user_id                  text primary key,
  summary                  text not null default '',
  application_preferences  jsonb not null default '[]'::jsonb,
  communication_style      jsonb not null default '[]'::jsonb,
  facts                    jsonb not null default '[]'::jsonb,
  sensitive_facts          jsonb not null default '[]'::jsonb,
  conflicts                jsonb not null default '[]'::jsonb,
  source_memory_ids        jsonb not null default '[]'::jsonb,
  source_memory_updated_at timestamptz,
  version                  integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists user_profile_enrichments_updated_idx
  on public.user_profile_enrichments (updated_at desc);
create index if not exists user_profile_enrichments_facts_gin_idx
  on public.user_profile_enrichments using gin (facts);
create index if not exists user_profile_enrichments_sensitive_facts_gin_idx
  on public.user_profile_enrichments using gin (sensitive_facts);

-- ======================================================================
-- Billing & quota (Dodo Payments subscriptions + monthly usage)
-- ======================================================================

-- One subscription row per user. Every user gets a row (plan='free') the
-- moment they sign up via the on_auth_user_created_subscription trigger.
-- Paid users carry the Dodo customer + subscription ids for the portal and
-- webhook reconciliation.
create table if not exists public.subscriptions (
  user_id              text primary key,
  plan                 text not null default 'free',     -- free | pro | premium
  status               text not null default 'active',   -- active|on_hold|cancelled|expired|failed
  dodo_customer_id     text,
  dodo_subscription_id text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_dodo_sub_idx
  on public.subscriptions (dodo_subscription_id);

-- Trigger: auto-create a free subscription row on user signup.
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

-- Admin view: every user + their subscription in one place.
-- Query from the Supabase SQL editor (service role) to see user_id, email,
-- name, plan, status, signup date, and billing IDs with full filterability.
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

-- Monthly metered usage counters. One row per (user, metric, period). The
-- period is a UTC "YYYY-MM" string; quotas reset by rolling to a new period.
create table if not exists public.usage_counters (
  user_id     text not null,
  metric      text not null,            -- e.g. 'tailored_cv'
  period      text not null,            -- 'YYYY-MM' (UTC)
  count       int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, metric, period)
);

-- Atomic increment used by the quota system (upsert + add in one statement).
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

-- ======================================================================
-- Row Level Security — owners only. The service role bypasses these.
-- ======================================================================

alter table public.profiles             enable row level security;
alter table public.tailored_cvs         enable row level security;
alter table public.tracker_connections  enable row level security;
alter table public.tracked_applications enable row level security;
alter table public.email_events         enable row level security;
alter table public.interview_preps      enable row level security;
alter table public.extension_auth_codes enable row level security;
alter table public.extension_sessions   enable row level security;
alter table public.extension_field_memories enable row level security;
alter table public.user_profile_enrichments enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.usage_counters       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','tailored_cvs','tracker_connections','tracked_applications',
    'email_events','interview_preps','extension_auth_codes','extension_sessions',
    'extension_field_memories','user_profile_enrichments',
    'subscriptions','usage_counters'
  ] loop
    execute format('drop policy if exists "owner_all" on public.%I;', t);
    execute format(
      'create policy "owner_all" on public.%I for all
         using (auth.uid()::text = user_id)
         with check (auth.uid()::text = user_id);', t);
  end loop;
end $$;
