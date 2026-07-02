create table if not exists founder_leads (
  id uuid primary key default gen_random_uuid(),
  gym_name text not null,
  website text,
  country text,
  city text,
  public_email text,
  contact_person text,
  owner_manager_name text,
  linkedin_url text,
  instagram_url text,
  gym_size text,
  pt_focus text,
  existing_app text,
  ai_fit_score integer not null default 5 check (ai_fit_score between 1 and 10),
  status text not null default 'Not Contacted' check (status in ('Not Contacted', 'Email Sent', 'Replied', 'Meeting Booked', 'Demo Completed', 'Pilot', 'Customer', 'Lost')),
  expected_mrr_cents integer not null default 0,
  current_mrr_cents integer not null default 0,
  last_contacted_at timestamptz,
  next_action_at timestamptz,
  research jsonb not null default '{}'::jsonb,
  email_drafts jsonb not null default '{}'::jsonb,
  source_urls text[] not null default '{}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists founder_leads_status_idx on founder_leads(status);
create index if not exists founder_leads_fit_idx on founder_leads(ai_fit_score desc);
create index if not exists founder_leads_country_city_idx on founder_leads(country, city);

create table if not exists founder_lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references founder_leads(id) on delete cascade,
  note_type text not null default 'general' check (note_type in ('general', 'meeting', 'objection', 'feature_request', 'next_action')),
  body text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists founder_lead_notes_lead_idx on founder_lead_notes(lead_id, created_at desc);

create table if not exists founder_lead_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references founder_leads(id) on delete cascade,
  channel text not null check (channel in ('gmail', 'linkedin', 'instagram', 'manual')),
  direction text not null check (direction in ('outbound', 'inbound')),
  subject text,
  body text not null,
  external_message_id text,
  approved_by uuid references users(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists founder_lead_conversations_lead_idx on founder_lead_conversations(lead_id, created_at desc);
