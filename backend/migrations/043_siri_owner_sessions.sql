create table if not exists siri_owner_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists siri_owner_sessions_user_active_idx
  on siri_owner_sessions (user_id, expires_at desc)
  where revoked_at is null;
