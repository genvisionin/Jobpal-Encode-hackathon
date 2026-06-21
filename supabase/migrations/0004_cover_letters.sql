-- Migration: customized cover letters for tailored CVs.
--
-- Stores the generated cover letter on the tailored_cvs row because the
-- letter is specific to that exact CV + job-description pair.

alter table public.tailored_cvs
  add column if not exists cover_letter jsonb;

notify pgrst, 'reload schema';
