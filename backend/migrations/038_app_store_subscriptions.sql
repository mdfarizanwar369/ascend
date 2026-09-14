alter table subscriptions
  add column if not exists apple_environment text check (apple_environment in ('Production', 'Sandbox')),
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_transaction_id text,
  add column if not exists apple_product_id text,
  add column if not exists apple_auto_renew boolean,
  add column if not exists apple_checked_at timestamptz;

create table if not exists apple_notification_receipts (
  notification_id text primary key,
  notification_type text not null,
  processed_at timestamptz not null default now()
);
create index if not exists subscriptions_apple_expiry_idx
  on subscriptions (user_id, current_period_end) where provider = 'app_store';
