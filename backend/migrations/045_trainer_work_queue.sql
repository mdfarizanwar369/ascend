create table if not exists trainer_work_queue_dispositions (
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('followup', 'win')),
  signal_key text not null,
  disposition text not null check (disposition in ('handled', 'snoozed')),
  suppress_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (trainer_user_id, client_user_id, kind)
);

create index if not exists trainer_work_queue_dispositions_active_idx
  on trainer_work_queue_dispositions (trainer_user_id, suppress_until);
