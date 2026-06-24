create table if not exists notification_devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'web',
  user_agent text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_devices_user_enabled_idx
  on notification_devices(user_id, enabled, last_seen_at desc);

create table if not exists notification_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  notification_type text not null,
  priority integer not null,
  title text not null,
  body text not null,
  href text not null default '/dashboard',
  tag text not null default 'ascend-coach',
  dedupe_key text not null,
  status text not null default 'sent',
  channel text not null default 'push',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists notification_events_user_dedupe_idx
  on notification_events(user_id, dedupe_key);

create index if not exists notification_events_user_type_created_idx
  on notification_events(user_id, notification_type, created_at desc);
