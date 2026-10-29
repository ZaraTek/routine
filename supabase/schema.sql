-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekdays int[] not null default '{}',   -- 0 = Sunday ... 6 = Saturday (weekly)
  month_day int,                          -- 1-31 (monthly; clamps to last day of short months)
  created_at timestamptz not null default now()
);

create table if not exists completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  date date not null,
  unique (task_id, date)
);

alter table tasks enable row level security;
alter table completions enable row level security;

create policy "own tasks" on tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own completions" on completions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
