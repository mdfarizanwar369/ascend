alter table users add column if not exists goal_version integer not null default 1;
alter table users add column if not exists goal_updated_at timestamptz;

update users
set goal_updated_at = coalesce(goal_updated_at, updated_at, created_at)
where goal_updated_at is null;

create table if not exists goal_changes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  goal_version integer not null,
  previous_goal_type goal_type,
  goal_type goal_type not null,
  previous_target_weight_kg numeric(5,2),
  target_weight_kg numeric(5,2),
  journey_start_weight_kg numeric(5,2),
  created_at timestamptz not null default now(),
  unique(user_id, goal_version)
);

create table if not exists goal_milestones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  goal_version integer not null,
  milestone_type text not null check (milestone_type in ('target_reached')),
  goal_type goal_type not null,
  target_weight_kg numeric(5,2) not null,
  achieved_weight_kg numeric(5,2) not null,
  achieved_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique(user_id, goal_version, milestone_type)
);

create index if not exists goal_changes_user_created_idx on goal_changes(user_id, created_at desc);
create index if not exists goal_milestones_user_achieved_idx on goal_milestones(user_id, achieved_at desc);
