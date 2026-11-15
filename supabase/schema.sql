-- Run this SQL in your Supabase project's SQL Editor to set up the Tapestry Tracker database.

create table if not exists public.tapestry_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  colors jsonb not null default '[]'::jsonb,
  -- RLE-encoded or flat color-index array stored as JSONB for compact cross-device sync
  grid_rle jsonb not null default '[]'::jsonb,
  completed_count integer not null default 0 check (completed_count >= 0),
  direction text not null default 'bottom-up-serpentine',
  max_chunk_stitches integer not null default 0,
  queue_length integer not null default 5,
  updated_at timestamptz not null default now()
);

alter table public.tapestry_projects enable row level security;

create policy "Users can view their own tapestry projects"
  on public.tapestry_projects
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tapestry projects"
  on public.tapestry_projects
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tapestry projects"
  on public.tapestry_projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tapestry projects"
  on public.tapestry_projects
  for delete
  using (auth.uid() = user_id);

-- Enable Realtime so progress syncs live across your devices
alter publication supabase_realtime add table public.tapestry_projects;
