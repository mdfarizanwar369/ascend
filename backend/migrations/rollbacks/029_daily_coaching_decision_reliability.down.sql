drop index if exists daily_coaching_decisions_rollout_metrics_idx;

alter table notification_devices
  drop column if exists timezone_offset_minutes;

alter table daily_coaching_decisions
  drop column if exists last_accessed_at,
  drop column if exists cache_hit_count,
  drop constraint if exists daily_coaching_decisions_resolution_mode_check;

delete from daily_coaching_decisions where resolution_mode = 'legacy_refined';

alter table daily_coaching_decisions
  add constraint daily_coaching_decisions_resolution_mode_check
    check (resolution_mode in ('rules_only', 'refined'));
