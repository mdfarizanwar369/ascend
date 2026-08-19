alter table daily_coaching_decisions
  add column if not exists refinement_status text not null default 'not_recorded'
    check (refinement_status in ('disabled', 'not_needed', 'not_available', 'capped', 'selected', 'no_result', 'not_recorded')),
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists prompt_version text,
  add column if not exists resolution_duration_ms integer not null default 0
    check (resolution_duration_ms >= 0),
  add column if not exists legacy_matches boolean;

create index if not exists daily_coaching_decisions_shadow_comparison_idx
  on daily_coaching_decisions(local_date desc, resolution_mode, legacy_matches);

create index if not exists daily_coaching_decisions_latest_active_idx
  on daily_coaching_decisions(user_id, updated_at desc)
  where resolution_mode = 'refined';
