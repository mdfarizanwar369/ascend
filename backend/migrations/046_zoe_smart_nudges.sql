-- Additive and inert: no enrolment, no dispatch and no production settings changes.
alter table notification_devices add column if not exists provider text not null default 'fcm';
alter table notification_devices add column if not exists apns_environment text;
alter table notification_devices add column if not exists token_version integer not null default 1;
alter table notification_devices add column if not exists timezone text;

create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  settings jsonb not null,
  version integer not null default 1,
  consented_at timestamptz,
  last_app_open_at timestamptz not null default now(),
  comeback_anchor timestamptz,
  comeback_attempts integer not null default 0 check (comeback_attempts between 0 and 3),
  last_comeback_at timestamptz,
  next_plan_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_preferences_plan_idx on notification_preferences(next_plan_at) where settings->>'enabled'='true';

create table notification_workout_schedule (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  starts_at timestamptz not null,
  lead_minutes integer not null default 30 check (lead_minutes in (0,15,30,60)),
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  version integer not null default 1,
  completion_event_id uuid references analytics_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_workout_schedule_user_time_idx on notification_workout_schedule(user_id,starts_at) where status='planned';

alter table notification_events add column if not exists nudge_category text;
alter table notification_events add column if not exists scheduled_for timestamptz;
alter table notification_events add column if not exists expires_at timestamptz;
alter table notification_events add column if not exists next_attempt_at timestamptz;
alter table notification_events add column if not exists preference_version integer;
alter table notification_events add column if not exists local_day date;
alter table notification_events add column if not exists context jsonb not null default '{}'::jsonb;
alter table notification_events add column if not exists dispatch_started_at timestamptz;
alter table notification_events add column if not exists opened_at timestamptz;
alter table notification_events add column if not exists action_completed_at timestamptz;
create index notification_events_due_idx on notification_events(next_attempt_at,priority,scheduled_for) where nudge_category is not null and status in ('scheduled','retry');
create index notification_events_caps_idx on notification_events(user_id,dispatch_started_at desc) where dispatch_started_at is not null;
create index notification_events_stale_idx on notification_events(dispatch_started_at) where nudge_category is not null and status='dispatching';
create index notification_events_unknown_idx on notification_events(dispatch_started_at) where nudge_category is not null and status='unknown';
create index notification_events_retention_idx on notification_events(created_at) where nudge_category is not null;

create table notification_deliveries (
  event_id uuid not null references notification_events(id) on delete cascade,
  device_id uuid not null references notification_devices(id) on delete cascade,
  token_version integer not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  result_code text,
  updated_at timestamptz not null default now(),
  primary key (event_id,device_id)
);
create table notification_transitions (
  id bigserial primary key,
  event_id uuid not null references notification_events(id) on delete cascade,
  state text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index notification_transitions_event_idx on notification_transitions(event_id,created_at);
create index notification_transitions_retention_idx on notification_transitions(created_at);
-- Retain only small milestone keys beyond event retention, never health measurements.
create table notification_milestones (
  user_id uuid not null references users(id) on delete cascade,
  milestone integer not null check (milestone in (1,10,25)),
  primary key(user_id,milestone)
);
