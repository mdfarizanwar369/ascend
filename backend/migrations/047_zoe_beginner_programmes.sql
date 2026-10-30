-- Additive owner-pilot storage. No existing workout, account or activity rows change.
create table if not exists zoe_beginner_programmes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  version integer not null default 1 check (version = 1),
  status text not null default 'active' check (status in ('active','paused','ended')),
  last_setup jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index if not exists zoe_beginner_one_current_programme_idx
  on zoe_beginner_programmes (user_id) where status in ('active','paused');
create index if not exists zoe_beginner_programme_user_idx
  on zoe_beginner_programmes (user_id, created_at desc);

create table if not exists zoe_beginner_programme_sessions (
  completion_key uuid primary key default uuid_generate_v4(),
  programme_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  session_number integer not null check (session_number >= 1),
  session_kind text not null check (session_kind in ('A','B')),
  request jsonb not null,
  workout jsonb not null,
  outcome text not null default 'open' check (outcome in ('open','completed','partial','dismissed','recovery')),
  qualifies boolean not null default false,
  burn_log_id uuid references analytics_events(id) on delete set null,
  generated_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (programme_id, user_id) references zoe_beginner_programmes(id, user_id) on delete cascade
);
create unique index if not exists zoe_beginner_one_open_session_idx
  on zoe_beginner_programme_sessions (programme_id) where outcome = 'open';
create unique index if not exists zoe_beginner_completion_event_idx
  on zoe_beginner_programme_sessions (burn_log_id) where burn_log_id is not null;
create index if not exists zoe_beginner_session_user_idx
  on zoe_beginner_programme_sessions (user_id, generated_at desc);
