alter table public.tracked_applications
  add column if not exists action_due_at timestamptz,
  add column if not exists notes text,
  add column if not exists job_url text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists latest_email_id text,
  add column if not exists latest_thread_id text;

alter table public.email_events
  add column if not exists thread_id text,
  add column if not exists event_date timestamptz;

create index if not exists tracked_applications_due_idx
  on public.tracked_applications (user_id, action_due_at);
