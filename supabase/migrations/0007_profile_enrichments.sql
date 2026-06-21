-- Profile enrichment layer derived from captured extension memories.

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

alter table public.user_profile_enrichments enable row level security;

drop policy if exists "owner_all" on public.user_profile_enrichments;
create policy "owner_all" on public.user_profile_enrichments for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
