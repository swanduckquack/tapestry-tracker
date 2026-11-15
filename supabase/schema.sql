-- Run this SQL in your Supabase project's SQL Editor to set up the Tapestry Tracker database.
-- Personal single-user mode (no sign-in required), safe to re-run.

create table if not exists public.tapestry_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  colors jsonb not null default '[]'::jsonb,
  grid_rle jsonb not null default '[]'::jsonb,
  completed_count integer not null default 0 check (completed_count >= 0),
  direction text not null default 'bottom-up-serpentine',
  max_chunk_stitches integer not null default 0,
  queue_length integer not null default 5,
  updated_at timestamptz not null default now()
);

-- If you ran the earlier schema that included user_id, remove that column & its old policies
alter table public.tapestry_projects drop column if exists user_id cascade;

alter table public.tapestry_projects enable row level security;

drop policy if exists "Personal tracker full access" on public.tapestry_projects;
create policy "Personal tracker full access"
  on public.tapestry_projects
  for all
  using (true)
  with check (true);

-- Enable Realtime only if not already added
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tapestry_projects'
  ) then
    alter publication supabase_realtime add table public.tapestry_projects;
  end if;
end $$;
