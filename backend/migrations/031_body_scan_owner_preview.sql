alter table body_composition_scans
  add column if not exists experience_scope text not null default 'athlete';

alter table body_composition_scans
  drop constraint if exists body_composition_scans_experience_scope_check;

alter table body_composition_scans
  add constraint body_composition_scans_experience_scope_check
  check (experience_scope in ('introductory', 'athlete'));

create index if not exists body_composition_scans_user_scope_date_idx
  on body_composition_scans(user_id, experience_scope, scan_date desc, created_at desc);

create table if not exists body_scan_explanations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references body_composition_scans(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  access_depth text not null,
  prompt_version text not null,
  explanation jsonb not null,
  source text not null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_scan_explanations_access_depth check (access_depth in ('introductory', 'premium', 'athlete')),
  constraint body_scan_explanations_source check (source in ('ai', 'fallback')),
  unique (scan_id, access_depth, prompt_version)
);

create index if not exists body_scan_explanations_user_created_idx
  on body_scan_explanations(user_id, created_at desc);

create table if not exists body_scan_followups (
  id uuid primary key default gen_random_uuid(),
  explanation_id uuid not null references body_scan_explanations(id) on delete cascade,
  scan_id uuid not null references body_composition_scans(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 2),
  question text not null check (char_length(question) between 2 and 500),
  answer text not null default '',
  source text not null default 'fallback' check (source in ('ai', 'fallback')),
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (explanation_id, slot)
);

create index if not exists body_scan_followups_user_scan_idx
  on body_scan_followups(user_id, scan_id, created_at);
