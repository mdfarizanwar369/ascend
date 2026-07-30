create table if not exists trainer_coaching_sessions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references users(id) on delete cascade,
  trainer_id uuid references trainers(id) on delete set null,
  created_by_user_id uuid not null references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete set null,
  status text not null default 'draft',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_minutes integer,
  raw_input text not null default '',
  structured_workout jsonb,
  client_recap text,
  between_session_focus text,
  trainer_next_session_note text,
  workout_event_id uuid,
  workout_completion_key uuid not null default uuid_generate_v4(),
  ai_confidence numeric(4,3),
  uncertain_fields jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_coaching_sessions_status_check check (status in ('draft', 'completed', 'cancelled')),
  constraint trainer_coaching_sessions_duration_check check (duration_minutes is null or duration_minutes between 5 and 300),
  constraint trainer_coaching_sessions_completion_check check (
    (status = 'completed' and completed_at is not null and workout_event_id is not null)
    or status <> 'completed'
  ),
  constraint trainer_coaching_sessions_completion_key_unique unique (workout_completion_key)
);

create unique index if not exists trainer_coaching_sessions_active_draft_idx
  on trainer_coaching_sessions(created_by_user_id, client_id)
  where status = 'draft';

create index if not exists trainer_coaching_sessions_client_completed_idx
  on trainer_coaching_sessions(client_id, completed_at desc)
  where status = 'completed';

create index if not exists trainer_coaching_sessions_trainer_updated_idx
  on trainer_coaching_sessions(created_by_user_id, updated_at desc);
