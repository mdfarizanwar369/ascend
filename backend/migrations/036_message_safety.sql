create table if not exists message_blocks (
  blocker_user_id uuid not null references users(id) on delete cascade,
  blocked_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table if not exists message_reports (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references messages(id) on delete cascade,
  reporter_user_id uuid not null references users(id) on delete cascade,
  reported_user_id uuid not null references users(id) on delete cascade,
  message_body text not null,
  reason text not null check (reason in ('harassment', 'inappropriate', 'spam', 'other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'removed', 'restricted', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  unique (message_id, reporter_user_id)
);
create index if not exists message_reports_queue_idx on message_reports(status, created_at);

create table if not exists message_restrictions (
  user_id uuid primary key references users(id) on delete cascade,
  restricted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
