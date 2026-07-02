create table if not exists founder_gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  gmail_email text,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz,
  history_id text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists founder_gmail_oauth_states (
  state text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table founder_lead_conversations
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_message_id text;

create unique index if not exists founder_lead_conversations_gmail_message_idx
  on founder_lead_conversations(gmail_message_id)
  where gmail_message_id is not null;

create index if not exists founder_lead_conversations_gmail_thread_idx
  on founder_lead_conversations(gmail_thread_id)
  where gmail_thread_id is not null;
