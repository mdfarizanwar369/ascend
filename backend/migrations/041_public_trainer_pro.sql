alter table gyms
  add column if not exists workspace_type text not null default 'gym'
    check (workspace_type in ('gym', 'independent')),
  add column if not exists created_for_trainer_user_id uuid references users(id) on delete set null;

create unique index if not exists gyms_independent_trainer_user_idx
  on gyms (created_for_trainer_user_id)
  where created_for_trainer_user_id is not null;

create table if not exists trainer_onboarding_intents (
  user_id uuid primary key references users(id) on delete cascade,
  mode text not null check (mode in ('independent', 'gym')),
  workspace_name text,
  country text,
  timezone text,
  trainer_invitation_id uuid,
  status text not null default 'pending' check (status in ('pending', 'activated', 'expired', 'failed')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trainer_invitations (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  gym_id uuid not null references gyms(id) on delete cascade,
  intended_email text,
  created_by_user_id uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trainer_invitation_lifecycle_check check (
    consumed_at is null or consumed_by_user_id is not null
  )
);

alter table trainer_onboarding_intents
  drop constraint if exists trainer_onboarding_intents_trainer_invitation_fk;
alter table trainer_onboarding_intents
  add constraint trainer_onboarding_intents_trainer_invitation_fk
  foreign key (trainer_invitation_id) references trainer_invitations(id) on delete set null;

create index if not exists trainer_invitations_gym_active_idx
  on trainer_invitations (gym_id, expires_at)
  where consumed_at is null and revoked_at is null;

create table if not exists client_trainer_connections (
  id uuid primary key default uuid_generate_v4(),
  client_user_id uuid not null references users(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  referral_code_id uuid references referral_codes(id) on delete set null,
  consent_policy_version text not null,
  consented_at timestamptz not null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  disconnected_by_user_id uuid references users(id) on delete set null,
  disconnect_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists client_trainer_connections_active_client_idx
  on client_trainer_connections (client_user_id)
  where disconnected_at is null;
create index if not exists client_trainer_connections_trainer_idx
  on client_trainer_connections (trainer_id, connected_at desc)
  where disconnected_at is null;

alter table subscriptions
  add column if not exists apple_offer_type integer,
  add column if not exists apple_offer_identifier text;

