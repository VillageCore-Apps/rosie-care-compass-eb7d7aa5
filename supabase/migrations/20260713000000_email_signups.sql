-- Customer email capture for the visitor email gate + admin portal.
-- Run this in the Supabase dashboard (SQL Editor) if it hasn't been applied.

create table if not exists public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;

-- Visitors sign up through the public site using the anon key.
create policy "anyone can sign up"
  on public.email_signups for insert to anon with check (true);

-- The admin portal reads the list with the anon key (client-side password
-- gate only for now — tighten this once real admin auth exists).
create policy "anyone can read signups"
  on public.email_signups for select to anon using (true);
