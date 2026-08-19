create table if not exists daily_coaching_decisions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  local_date date not null,
  timezone_offset_minutes smallint not null,
  input_fingerprint text not null,
  engine_version text not null,
  resolution_mode text not null check (resolution_mode in ('rules_only', 'refined')),
  decision_source text not null check (decision_source in ('rules', 'ai')),
  priority_key text check (priority_key in ('Meal', 'Water', 'Movement')),
  priority jsonb not null,
  insight jsonb not null,
  ai_attempted boolean not null default false,
  legacy_priority_key text check (legacy_priority_key in ('Meal', 'Water', 'Movement')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, input_fingerprint, engine_version, resolution_mode)
);

create index if not exists daily_coaching_decisions_user_date_idx
  on daily_coaching_decisions(user_id, local_date desc, created_at desc);

create index if not exists daily_coaching_decisions_expiry_idx
  on daily_coaching_decisions(expires_at);
