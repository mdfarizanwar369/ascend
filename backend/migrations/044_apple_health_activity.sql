create table health_activity_settings (
  user_id uuid primary key references users(id) on delete cascade,
  timezone text not null,
  calendar_generation uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table health_activity_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('apple_health','health_connect')),
  installation_id uuid not null,
  generation uuid not null default gen_random_uuid(),
  consent_version text not null,
  connected boolean not null default true,
  selected boolean not null default false,
  last_sequence bigint not null default -1,
  last_uploaded_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,provider,installation_id)
);
create unique index health_activity_selected on health_activity_sources(user_id) where selected;

create table health_activity_snapshots (
  source_id uuid not null references health_activity_sources(id) on delete cascade,
  day date not null,
  timezone text not null,
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  observed_at timestamptz not null,
  steps bigint check (steps >= 0),
  steps_state text not null check (steps_state in ('observed','unavailable')),
  active_calories numeric check (active_calories >= 0),
  energy_state text not null check (energy_state in ('observed','unavailable')),
  primary key (source_id,day)
);

create table health_activity_workouts (
  source_id uuid not null references health_activity_sources(id) on delete cascade,
  external_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at >= start_at),
  activity_type text not null,
  active_calories numeric check (active_calories >= 0),
  source_name text,
  deleted boolean not null default false,
  primary key (source_id,external_id)
);

create table health_activity_manual_links (
  user_id uuid not null references users(id) on delete cascade,
  activity_id uuid not null references analytics_events(id) on delete cascade,
  source_id uuid references health_activity_sources(id) on delete cascade,
  matched_workout_id text,
  confirmed_untracked boolean not null default false,
  active_calories numeric check (active_calories >= 0),
  confirmed_at timestamptz not null default now(),
  primary key (user_id,activity_id),
  check (not (confirmed_untracked and matched_workout_id is not null))
);

create table health_activity_import_requests (
  source_id uuid not null references health_activity_sources(id) on delete cascade,
  generation uuid not null,
  request_id uuid not null,
  payload_hash text not null,
  accepted_at timestamptz not null default now(),
  primary key (source_id,generation,request_id)
);

create table health_activity_daily_summaries (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  timezone text not null,
  source_id uuid references health_activity_sources(id) on delete set null,
  summary jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id,day)
);

-- Apple-derived activity is deliberately isolated from legacy Health Connect,
-- AI context builders, trainer queries and marketing analytics.
