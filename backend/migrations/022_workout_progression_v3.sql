create table if not exists workout_exercise_observations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  source_event_id uuid not null references analytics_events(id) on delete cascade,
  source_type text not null,
  exercise_position integer not null,
  exercise_key text not null,
  display_name text not null,
  sets integer,
  reps_text text,
  total_reps numeric(10,2),
  load numeric(10,2),
  load_unit text,
  duration_seconds integer,
  difficulty text,
  confidence numeric(4,3) not null default 1,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint workout_exercise_observations_position_check check (exercise_position >= 0),
  constraint workout_exercise_observations_load_unit_check check (load_unit is null or load_unit in ('kg', 'lb')),
  constraint workout_exercise_observations_source_check check (source_type in ('ai_workout_capture', 'trainer_logged_session')),
  constraint workout_exercise_observations_unique unique (source_event_id, exercise_position)
);

create index if not exists workout_exercise_observations_history_idx
  on workout_exercise_observations(user_id, exercise_key, completed_at desc);

create index if not exists workout_exercise_observations_event_idx
  on workout_exercise_observations(source_event_id);

create table if not exists workout_exercise_aliases (
  user_id uuid not null references users(id) on delete cascade,
  alias_key text not null,
  canonical_key text not null,
  relationship text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, alias_key),
  constraint workout_exercise_aliases_relationship_check check (relationship in ('same', 'different'))
);

create index if not exists workout_exercise_aliases_canonical_idx
  on workout_exercise_aliases(user_id, canonical_key);
