-- Agenda: one-off tasks and assignments with a due date. Run once in the Supabase SQL Editor.

create table if not exists agenda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null,
  due_time time,          -- optional
  notes text,
  done_at timestamptz,    -- null until checked off
  created_at timestamptz not null default now()
);

alter table agenda enable row level security;

create policy "own agenda" on agenda
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
