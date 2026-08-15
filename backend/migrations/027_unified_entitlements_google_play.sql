alter type subscription_provider add value if not exists 'promotional';

create table if not exists subscription_entitlements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  plan subscription_plan not null,
  provider text not null check (provider in ('stripe', 'google_play', 'manual', 'promotional', 'lemonsqueezy', 'toyyibpay')),
  provider_account_ref text,
  provider_subscription_ref text,
  provider_product_id text,
  provider_base_plan_id text,
  provider_offer_id text,
  status text not null check (status in (
    'pending', 'active', 'trial', 'grace_period', 'on_hold', 'paused',
    'canceled', 'expired', 'revoked', 'refunded', 'unknown'
  )),
  purchase_state text not null default 'unknown',
  started_at timestamptz,
  expires_at timestamptz,
  auto_renew_enabled boolean not null default false,
  acknowledged boolean not null default false,
  last_verified_at timestamptz,
  stale_after timestamptz,
  provider_event_time timestamptz,
  provider_event_version bigint not null default 0,
  retry_state text not null default 'none' check (retry_state in ('none', 'pending', 'retrying', 'manual_review', 'dead_letter')),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  last_error_code text,
  management_type text not null default 'none' check (management_type in ('none', 'web_portal', 'google_play', 'manual')),
  management_url text,
  audit_evidence jsonb not null default '{}',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_ref),
  unique (idempotency_key)
);

create index if not exists subscription_entitlements_user_status_idx
  on subscription_entitlements(user_id, status, expires_at desc);
create index if not exists subscription_entitlements_retry_idx
  on subscription_entitlements(retry_state, next_retry_at)
  where retry_state in ('pending', 'retrying');

create table if not exists subscription_provider_tokens (
  id uuid primary key default uuid_generate_v4(),
  entitlement_id uuid not null unique references subscription_entitlements(id) on delete cascade,
  provider text not null check (provider = 'google_play'),
  token_hash text not null unique,
  token_ciphertext text not null,
  token_iv text not null,
  token_auth_tag text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_play_rtdn_events (
  id uuid primary key default uuid_generate_v4(),
  message_id text not null unique,
  package_name text not null,
  event_time timestamptz,
  notification_type integer,
  subscription_id text,
  token_hash text,
  status text not null default 'received' check (status in ('received', 'processed', 'unmatched', 'retry_required', 'rejected', 'dead_letter')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_error_code text,
  safe_payload jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_play_rtdn_retry_idx
  on google_play_rtdn_events(status, next_retry_at)
  where status in ('received', 'retry_required');

create table if not exists google_play_reconciliation_jobs (
  id uuid primary key default uuid_generate_v4(),
  entitlement_id uuid not null references subscription_entitlements(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'dead_letter')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_play_reconciliation_active_idx
  on google_play_reconciliation_jobs(entitlement_id)
  where status in ('pending', 'processing');
create index if not exists google_play_reconciliation_due_idx
  on google_play_reconciliation_jobs(status, next_attempt_at);

create table if not exists billing_audit_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  entitlement_id uuid references subscription_entitlements(id) on delete set null,
  provider text not null,
  event_type text not null,
  event_id text not null unique,
  environment text not null,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now()
);

insert into subscription_entitlements (
  user_id, plan, provider, provider_account_ref, provider_subscription_ref,
  status, started_at, expires_at, auto_renew_enabled, acknowledged,
  last_verified_at, stale_after, management_type, idempotency_key, audit_evidence
)
select
  s.user_id,
  s.plan,
  s.provider::text,
  s.provider_customer_id,
  s.provider_subscription_id,
  case s.status::text
    when 'trialing' then 'trial'
    when 'past_due' then 'on_hold'
    else s.status::text
  end,
  s.current_period_start,
  s.current_period_end,
  s.status in ('active', 'trialing'),
  true,
  s.updated_at,
  s.updated_at + interval '24 hours',
  case when s.provider in ('stripe', 'lemonsqueezy') then 'web_portal' else 'manual' end,
  'legacy-subscription:' || s.id::text,
  jsonb_build_object('source', 'migration_027', 'legacySubscriptionId', s.id::text)
from subscriptions s
where s.provider <> 'google_play'
  and s.provider_subscription_id is not null
on conflict do nothing;
