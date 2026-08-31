create table if not exists ascend_coach_client_insights (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  relationship_id uuid not null references trainer_client_relationships(id) on delete cascade,
  authorization_version bigint not null,
  scope_fingerprint text not null,
  source_fingerprint text not null,
  snapshot_schema_version text not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  insight jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  cache_hit_count integer not null default 0,
  constraint ascend_coach_client_insight_object_check check (jsonb_typeof(insight) = 'object'),
  constraint ascend_coach_client_insight_expiry_check check (expires_at > created_at),
  constraint ascend_coach_client_insight_cache_hit_check check (cache_hit_count >= 0),
  unique (
    actor_user_id, client_user_id, relationship_id, authorization_version,
    scope_fingerprint, source_fingerprint, snapshot_schema_version,
    prompt_version, provider, model
  )
);

create index if not exists ascend_coach_client_insights_lookup_idx
  on ascend_coach_client_insights (
    actor_user_id, client_user_id, relationship_id, authorization_version,
    prompt_version, provider, model, expires_at desc
  );

create index if not exists ascend_coach_client_insights_expiry_idx
  on ascend_coach_client_insights (expires_at);
