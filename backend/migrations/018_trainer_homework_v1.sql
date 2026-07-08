create table if not exists trainer_homework_assignments (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid references trainers(id) on delete set null,
  assigned_by_user_id uuid not null references users(id) on delete cascade,
  client_id uuid not null references users(id) on delete cascade,
  workout_json jsonb not null,
  title text not null,
  goal text not null,
  location text not null,
  equipment jsonb not null default '[]'::jsonb,
  duration_minutes integer not null,
  intensity text not null,
  coach_note text,
  assignment_date date not null,
  due_date date not null,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_burn_log_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_homework_status_check check (status in ('assigned', 'completed', 'missed')),
  constraint trainer_homework_duration_check check (duration_minutes between 5 and 180),
  constraint trainer_homework_due_check check (due_date >= assignment_date)
);

create index if not exists trainer_homework_client_status_idx
  on trainer_homework_assignments(client_id, status, assignment_date desc, created_at desc);

create index if not exists trainer_homework_trainer_status_idx
  on trainer_homework_assignments(assigned_by_user_id, client_id, status, assignment_date desc, created_at desc);

create index if not exists trainer_homework_due_idx
  on trainer_homework_assignments(status, due_date);
