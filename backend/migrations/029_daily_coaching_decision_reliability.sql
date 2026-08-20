alter table daily_coaching_decisions
  drop constraint if exists daily_coaching_decisions_resolution_mode_check;

alter table daily_coaching_decisions
  add constraint daily_coaching_decisions_resolution_mode_check
    check (resolution_mode in ('rules_only', 'refined', 'legacy_refined')),
  add column if not exists cache_hit_count integer not null default 0
    check (cache_hit_count >= 0),
  add column if not exists last_accessed_at timestamptz not null default now();

alter table notification_devices
  add column if not exists timezone_offset_minutes smallint not null default 0
    check (timezone_offset_minutes between -840 and 840);

create index if not exists daily_coaching_decisions_rollout_metrics_idx
  on daily_coaching_decisions(created_at desc, resolution_mode, refinement_status);
