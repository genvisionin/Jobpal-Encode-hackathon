-- Chrome extension auth support.

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

alter table public.extension_auth_codes enable row level security;
alter table public.extension_sessions   enable row level security;
alter table public.extension_field_memories enable row level security;

drop policy if exists "owner_all" on public.extension_auth_codes;
create policy "owner_all" on public.extension_auth_codes for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "owner_all" on public.extension_sessions;
create policy "owner_all" on public.extension_sessions for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "owner_all" on public.extension_field_memories;
create policy "owner_all" on public.extension_field_memories for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
