create table if not exists workout_debriefs (
  id uuid primary key default uuid_generate_v4(),
  workout_event_id uuid not null references analytics_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('pending', 'generating', 'generated', 'fallback', 'not_required')),
  workout_signal jsonb not null,
  debrief_output jsonb,
  fallback_text text not null,
  provider text,
  model text,
  prompt_version text not null,
  failure_reason text,
  generation_started_at timestamptz,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_event_id)
);

create index if not exists workout_debriefs_user_created_idx
  on workout_debriefs(user_id, created_at desc);

create index if not exists workout_debriefs_status_started_idx
  on workout_debriefs(status, generation_started_at);
