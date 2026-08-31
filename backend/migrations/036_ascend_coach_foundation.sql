create table if not exists trainer_client_relationships (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  status text not null default 'invited',
  provenance text not null default 'coach_invite',
  requested_scopes text[] not null default array['profile', 'training']::text[],
  data_scopes text[] not null default '{}'::text[],
  is_primary_programming_authority boolean not null default false,
  consent_version text,
  invited_by_user_id uuid references users(id) on delete set null,
  ended_by_user_id uuid references users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  ended_at timestamptz,
  authorization_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_client_relationship_status_check check (
    status in ('invited', 'active', 'declined', 'revoked_by_client', 'ended_by_trainer', 'suspended')
  ),
  constraint trainer_client_relationship_provenance_check check (
    provenance in ('coach_invite', 'legacy_assigned_trainer', 'legacy_admin_assignment')
  ),
  constraint trainer_client_requested_scopes_check check (
    cardinality(requested_scopes) > 0
    and requested_scopes <@ array['profile', 'training', 'nutrition', 'body', 'recovery', 'progress_photos']::text[]
  ),
  constraint trainer_client_data_scopes_check check (
    data_scopes <@ array['profile', 'training', 'nutrition', 'body', 'recovery', 'progress_photos']::text[]
    and data_scopes <@ requested_scopes
  ),
  constraint trainer_client_consent_state_check check (
    (status = 'active' and accepted_at is not null and consent_version is not null and cardinality(data_scopes) > 0)
    or (status <> 'active')
  ),
  constraint trainer_client_terminal_timestamp_check check (
    (status <> 'declined' or declined_at is not null)
    and (status <> 'revoked_by_client' or revoked_at is not null)
    and (status <> 'ended_by_trainer' or ended_at is not null)
  )
);

create unique index if not exists trainer_client_relationship_open_pair_idx
  on trainer_client_relationships(trainer_id, client_user_id)
  where status in ('invited', 'active', 'suspended');

create unique index if not exists trainer_client_relationship_primary_client_idx
  on trainer_client_relationships(client_user_id)
  where status = 'active' and is_primary_programming_authority = true;

create index if not exists trainer_client_relationship_trainer_status_idx
  on trainer_client_relationships(trainer_id, status, updated_at desc);

create index if not exists trainer_client_relationship_client_status_idx
  on trainer_client_relationships(client_user_id, status, updated_at desc);

create table if not exists ascend_coach_pilot_access (
  user_id uuid primary key references users(id) on delete cascade,
  granted_by_user_id uuid references users(id) on delete set null,
  reason text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ascend_coach_pilot_reason_check check (char_length(reason) between 10 and 500),
  constraint ascend_coach_pilot_expiry_check check (expires_at is null or expires_at > created_at)
);

create table if not exists ascend_coach_break_glass_grants (
  id uuid primary key default uuid_generate_v4(),
  platform_owner_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ascend_coach_break_glass_reason_check check (char_length(reason) between 20 and 500),
  constraint ascend_coach_break_glass_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '60 minutes'
  )
);

create index if not exists ascend_coach_break_glass_active_idx
  on ascend_coach_break_glass_grants(platform_owner_user_id, client_user_id, expires_at desc)
  where revoked_at is null;

create table if not exists ascend_coach_access_audit_events (
  id uuid primary key default uuid_generate_v4(),
  relationship_id uuid references trainer_client_relationships(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  trainer_id uuid references trainers(id) on delete set null,
  client_user_id uuid references users(id) on delete set null,
  subject_user_id uuid references users(id) on delete set null,
  event_type text not null,
  authorization_version bigint,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint ascend_coach_audit_event_type_check check (event_type in (
    'relationship_invited', 'relationship_accepted', 'relationship_declined',
    'relationship_revoked', 'relationship_ended', 'relationship_scopes_requested',
    'legacy_relationship_backfilled', 'pilot_access_granted', 'pilot_access_revoked',
    'legacy_admin_assignment_created', 'legacy_admin_assignment_ended',
    'break_glass_granted', 'break_glass_used', 'break_glass_revoked'
  )),
  constraint ascend_coach_audit_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists ascend_coach_access_audit_client_idx
  on ascend_coach_access_audit_events(client_user_id, occurred_at desc);

create index if not exists ascend_coach_access_audit_actor_idx
  on ascend_coach_access_audit_events(actor_user_id, occurred_at desc);

create or replace function bump_trainer_client_authorization_version()
returns trigger as $$
begin
  new.updated_at = now();
  if row(new.status, new.requested_scopes, new.data_scopes, new.is_primary_programming_authority)
     is distinct from
     row(old.status, old.requested_scopes, old.data_scopes, old.is_primary_programming_authority) then
    new.authorization_version = old.authorization_version + 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trainer_client_relationship_authorization_version on trainer_client_relationships;
create trigger trainer_client_relationship_authorization_version
before update on trainer_client_relationships
for each row execute function bump_trainer_client_authorization_version();

create or replace function sync_assigned_trainer_projection_for_client(target_client_id uuid)
returns void as $$
declare
  projected_trainer_id uuid;
  has_active_relationship boolean;
begin
  select relationship.trainer_id
  into projected_trainer_id
  from trainer_client_relationships relationship
  where relationship.client_user_id = target_client_id
    and relationship.status = 'active'
    and relationship.is_primary_programming_authority = true
  order by relationship.accepted_at desc, relationship.created_at desc
  limit 1;

  select exists (
    select 1 from trainer_client_relationships relationship
    where relationship.client_user_id = target_client_id and relationship.status = 'active'
  ) into has_active_relationship;

  update users
  set assigned_trainer_id = projected_trainer_id,
      coaching_mode = case
        when has_active_relationship then 'human_coach'
        else coaching_mode
      end,
      updated_at = now()
  where id = target_client_id
    and (
      assigned_trainer_id is distinct from projected_trainer_id
      or (has_active_relationship and coaching_mode <> 'human_coach')
    );
end;
$$ language plpgsql;

create or replace function sync_assigned_trainer_projection()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform sync_assigned_trainer_projection_for_client(old.client_user_id);
    return old;
  end if;

  perform sync_assigned_trainer_projection_for_client(new.client_user_id);
  if tg_op = 'UPDATE' and old.client_user_id is distinct from new.client_user_id then
    perform sync_assigned_trainer_projection_for_client(old.client_user_id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trainer_client_relationship_projection on trainer_client_relationships;
create trigger trainer_client_relationship_projection
after insert or update or delete on trainer_client_relationships
for each row execute function sync_assigned_trainer_projection();

insert into trainer_client_relationships (
  trainer_id, client_user_id, status, provenance, requested_scopes, data_scopes,
  is_primary_programming_authority, consent_version, invited_by_user_id, invited_at, accepted_at
)
select
  u.assigned_trainer_id,
  u.id,
  'active',
  'legacy_assigned_trainer',
  array['profile', 'training', 'nutrition', 'body', 'recovery', 'progress_photos']::text[],
  array['profile', 'training', 'nutrition', 'body', 'recovery', 'progress_photos']::text[],
  true,
  'legacy-assignment-v1',
  t.user_id,
  coalesce(u.updated_at, u.created_at, now()),
  coalesce(u.updated_at, u.created_at, now())
from users u
join trainers t on t.id = u.assigned_trainer_id
where u.assigned_trainer_id is not null
on conflict do nothing;

insert into ascend_coach_access_audit_events (
  relationship_id, actor_user_id, trainer_id, client_user_id, event_type, authorization_version, metadata
)
select
  relationship.id,
  relationship.invited_by_user_id,
  relationship.trainer_id,
  relationship.client_user_id,
  'legacy_relationship_backfilled',
  relationship.authorization_version,
  jsonb_build_object('provenance', relationship.provenance)
from trainer_client_relationships relationship
where relationship.provenance = 'legacy_assigned_trainer'
  and not exists (
    select 1 from ascend_coach_access_audit_events audit
    where audit.relationship_id = relationship.id and audit.event_type = 'legacy_relationship_backfilled'
  );
