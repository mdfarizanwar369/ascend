create table if not exists athlete_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  enabled boolean not null default false,
  sport text,
  division text,
  competition_name text,
  competition_date date,
  coach_name text,
  goal_weight_kg numeric(6,2),
  activated_by_user_id uuid references users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_profile_sport_length check (sport is null or char_length(sport) <= 80),
  constraint athlete_profile_division_length check (division is null or char_length(division) <= 80),
  constraint athlete_profile_event_length check (competition_name is null or char_length(competition_name) <= 120),
  constraint athlete_profile_goal_weight check (goal_weight_kg is null or goal_weight_kg between 25 and 400)
);

create table if not exists athlete_readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  checkin_date date not null default current_date,
  sleep_hours numeric(4,1) not null,
  energy smallint not null,
  soreness smallint not null,
  stress smallint not null,
  hunger smallint not null,
  motivation smallint not null,
  readiness_score smallint not null,
  readiness_band text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checkin_date),
  constraint athlete_sleep_range check (sleep_hours between 0 and 16),
  constraint athlete_energy_range check (energy between 1 and 10),
  constraint athlete_soreness_range check (soreness between 1 and 10),
  constraint athlete_stress_range check (stress between 1 and 10),
  constraint athlete_hunger_range check (hunger between 1 and 10),
  constraint athlete_motivation_range check (motivation between 1 and 10),
  constraint athlete_readiness_score_range check (readiness_score between 0 and 100),
  constraint athlete_readiness_band_value check (readiness_band in ('green', 'yellow', 'red'))
);

create table if not exists athlete_weekly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  assigned_by_user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  target_type text not null,
  target_value numeric(10,2) not null,
  unit text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start, target_type),
  constraint athlete_target_type_value check (target_type in ('runs', 'cardio_minutes', 'steps', 'strength_sessions', 'mobility_sessions', 'recovery_days', 'custom')),
  constraint athlete_target_positive check (target_value > 0 and target_value <= 1000000),
  constraint athlete_target_unit_length check (char_length(unit) between 1 and 30),
  constraint athlete_target_notes_length check (notes is null or char_length(notes) <= 240)
);

create table if not exists athlete_target_progress (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references athlete_weekly_targets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  progress_date date not null default current_date,
  completed_value numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_id, progress_date),
  constraint athlete_progress_nonnegative check (completed_value >= 0 and completed_value <= 1000000)
);

create table if not exists athlete_coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  author_user_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_note_length check (char_length(body) between 1 and 2000)
);

create table if not exists athlete_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  readiness_average numeric(5,2),
  compliance_percent numeric(5,2) not null default 0,
  checkins_completed integer not null default 0,
  summary text not null,
  coach_comment text,
  reviewed_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint athlete_review_compliance_range check (compliance_percent between 0 and 100),
  constraint athlete_review_comment_length check (coach_comment is null or char_length(coach_comment) <= 2000)
);

create index if not exists athlete_checkins_user_date_idx on athlete_readiness_checkins(user_id, checkin_date desc);
create index if not exists athlete_targets_user_week_idx on athlete_weekly_targets(user_id, week_start desc);
create index if not exists athlete_progress_user_date_idx on athlete_target_progress(user_id, progress_date desc);
create index if not exists athlete_notes_user_created_idx on athlete_coach_notes(user_id, created_at desc);
create index if not exists athlete_reviews_user_week_idx on athlete_weekly_reviews(user_id, week_start desc);
