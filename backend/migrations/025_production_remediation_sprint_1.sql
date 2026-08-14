alter table users
  add column if not exists timezone text;

alter table users
  drop constraint if exists users_timezone_length;

alter table users
  add constraint users_timezone_length
  check (timezone is null or char_length(timezone) between 1 and 80);

create table if not exists media_uploads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  object_key text not null unique,
  status text not null default 'pending',
  declared_content_type text not null,
  detected_content_type text,
  byte_size integer,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  attached_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  constraint media_uploads_purpose_check check (purpose in ('food', 'progress', 'profile', 'body_composition')),
  constraint media_uploads_status_check check (status in ('pending', 'completed', 'attached', 'failed', 'deleted')),
  constraint media_uploads_byte_size_check check (byte_size is null or byte_size between 1 and 5242880),
  constraint media_uploads_dimensions_check check (
    (width is null and height is null)
    or (width between 1 and 8000 and height between 1 and 8000)
  )
);

create index if not exists media_uploads_user_created_idx
  on media_uploads(user_id, created_at desc);

create index if not exists media_uploads_pending_idx
  on media_uploads(created_at)
  where status = 'pending';

alter table account_deletion_requests
  add column if not exists workflow_stage text not null default 'requested',
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists media_keys text[] not null default '{}',
  add column if not exists firebase_deleted_at timestamptz,
  add column if not exists storage_deleted_at timestamptz,
  add column if not exists database_deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table account_deletion_requests
  drop constraint if exists account_deletion_requests_workflow_stage_check;

alter table account_deletion_requests
  add constraint account_deletion_requests_workflow_stage_check
  check (workflow_stage in ('requested', 'firebase', 'storage', 'database', 'completed', 'retry_required', 'manual_review'));
