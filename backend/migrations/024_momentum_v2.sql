create table if not exists momentum_scores_v2 (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  fuel_score integer not null,
  move_score integer not null,
  recover_score integer not null,
  focus_score integer,
  fuel_status text not null,
  move_status text not null,
  recover_status text not null,
  focus_status text not null,
  focus_active boolean not null default false,
  period_start date not null,
  period_end date not null,
  calculated_for_date date not null,
  score_version text not null default 'v2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, calculated_for_date)
);

create index if not exists momentum_scores_v2_user_date_idx
  on momentum_scores_v2(user_id, calculated_for_date desc);

create table if not exists recovery_checkins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  checkin_date date not null,
  sleep_quality text not null check (sleep_quality in ('poor', 'okay', 'good')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, checkin_date)
);

create index if not exists recovery_checkins_user_date_idx
  on recovery_checkins(user_id, checkin_date desc);
