create table monthly_challenges (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid not null references gyms(id) on delete cascade,
  trainer_id uuid references trainers(id) on delete cascade,
  time_zone text not null,
  title text not null check (char_length(title) between 1 and 64),
  template text not null check (template in ('meals','hydration','movement')),
  actions text[] not null check (cardinality(actions) between 1 and 3 and actions <@ array['meals','hydration','movement']),
  required_actions smallint not null check (required_actions between 1 and cardinality(actions)),
  starts_on date not null,
  ends_on date not null check (ends_on between starts_on and starts_on + 30),
  goal_days smallint not null check (goal_days between 1 and ends_on - starts_on + 1),
  leaderboard boolean not null,
  published_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index monthly_challenges_gym_idx on monthly_challenges (gym_id, starts_on desc);

create table monthly_challenge_members (
  challenge_id uuid not null references monthly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_on date not null,
  display_name text check (char_length(display_name) between 1 and 28),
  water_target_ml integer check (water_target_ml > 0),
  primary key (challenge_id, user_id)
);
create index monthly_challenge_members_account_idx on monthly_challenge_members(user_id);

create table monthly_challenge_meal_days (
  user_id uuid not null references users(id) on delete cascade,
  time_zone text not null,
  day date not null,
  primary key (user_id, time_zone, day)
);
