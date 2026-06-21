-- Migration: career-intelligence layer + career-ops fit analysis columns.
--
-- Adds the derived `insights` JSON to profiles and the A–F-style analysis
-- columns to tailored_cvs. Idempotent (safe to run more than once).
--
-- Apply with either:
--   • Supabase Dashboard → SQL Editor → paste this file → Run
--   • psql "postgresql://postgres.<ref>:<DB_PASSWORD>@aws-1-us-west-2.pooler.supabase.com:6543/postgres" -f this_file

-- profiles: derived career intelligence (archetypes + narrative + proof points)
alter table public.profiles
  add column if not exists insights jsonb not null default '{}'::jsonb;

-- tailored_cvs: the career-ops fit analysis (blocks A–F, adapted)
alter table public.tailored_cvs
  add column if not exists archetype text;
alter table public.tailored_cvs
  add column if not exists archetype_rationale text;
alter table public.tailored_cvs
  add column if not exists score_breakdown jsonb not null default '[]'::jsonb;
alter table public.tailored_cvs
  add column if not exists requirement_matches jsonb not null default '[]'::jsonb;
alter table public.tailored_cvs
  add column if not exists customization_plan jsonb not null default '[]'::jsonb;

-- Ask PostgREST to refresh its schema cache so the API sees the new columns
-- immediately (otherwise it may take a short while / a restart).
notify pgrst, 'reload schema';
