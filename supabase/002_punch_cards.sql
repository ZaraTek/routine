-- Punch cards: "N times a week" tasks. Run once in the Supabase SQL Editor.

alter table tasks drop constraint if exists tasks_frequency_check;
alter table tasks add constraint tasks_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'punch'));

alter table tasks add column if not exists punch_target int
  check (punch_target between 1 and 7);  -- punches per Monday-Sunday week
