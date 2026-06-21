-- Migration: interview prep packs.
--
-- Adds the `interview_preps` table — one auto-generated prep brief per tracked
-- application (1:1, upserted on user_id + application_id). The brief is stored
-- as JSONB (the validated `InterviewPrep` shape). Idempotent.
--
-- Apply with either:
--   • Supabase Dashboard → SQL Editor → paste this file → Run
--   • psql "postgresql://postgres.<ref>:<DB_PASSWORD>@aws-1-us-west-2.pooler.supabase.com:6543/postgres" -f this_file

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

-- Row Level Security — owners only (service role bypasses).
alter table public.interview_preps enable row level security;

drop policy if exists "owner_all" on public.interview_preps;
create policy "owner_all" on public.interview_preps for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Refresh PostgREST's schema cache so the API sees the new table immediately.
notify pgrst, 'reload schema';
