-- Additive: older application versions do not read this table.
create table if not exists ai_work_leases (
  token uuid primary key,
  resource text not null,
  expires_at timestamptz not null
);
create index if not exists ai_work_leases_resource_expiry_idx on ai_work_leases(resource, expires_at);
