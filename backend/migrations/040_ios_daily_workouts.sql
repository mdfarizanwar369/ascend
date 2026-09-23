create table if not exists ios_daily_workouts (
  completion_key uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  request jsonb not null,
  workout jsonb not null,
  created_at timestamptz not null default now(),
  resets_at timestamptz not null
);
create index if not exists ios_daily_workouts_user_reset_idx
  on ios_daily_workouts(user_id, resets_at desc);
