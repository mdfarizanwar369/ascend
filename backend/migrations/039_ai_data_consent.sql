-- No user is opted in by migration. A new disclosure/provider requires a new choice.
create table if not exists ai_data_consents (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai')),
  disclosure_version text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, disclosure_version)
);
