create table if not exists health_sync_connections (
  user_id uuid primary key references users(id) on delete cascade,
  provider text not null default 'health_connect',
  status text not null default 'connected',
  permissions jsonb not null default '[]'::jsonb,
  device_timezone text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists health_sync_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null default 'health_connect',
  record_type text not null,
  external_record_id text not null,
  recorded_on date,
  start_at timestamptz,
  end_at timestamptz,
  value_numeric numeric(12,2),
  unit text,
  source_app text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, record_type, external_record_id)
);

create index if not exists health_sync_connections_status_idx
  on health_sync_connections(status, last_synced_at desc);

create index if not exists health_sync_records_user_type_date_idx
  on health_sync_records(user_id, record_type, recorded_on desc);

create index if not exists health_sync_records_user_type_start_idx
  on health_sync_records(user_id, record_type, start_at desc);
