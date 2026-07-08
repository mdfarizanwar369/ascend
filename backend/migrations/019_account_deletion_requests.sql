create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  email text not null,
  full_name text not null,
  primary_role text not null,
  mode text not null,
  status text not null default 'requested',
  reason_codes text[] not null default '{}',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  notes text,
  constraint account_deletion_requests_mode_check check (mode in ('immediate', 'manual_review')),
  constraint account_deletion_requests_status_check check (status in ('requested', 'completed', 'rejected'))
);

create index if not exists account_deletion_requests_requested_idx
  on account_deletion_requests(requested_at desc);

create unique index if not exists account_deletion_requests_open_user_idx
  on account_deletion_requests(user_id)
  where status = 'requested';
