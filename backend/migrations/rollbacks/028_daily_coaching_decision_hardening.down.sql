drop index if exists daily_coaching_decisions_shadow_comparison_idx;
drop index if exists daily_coaching_decisions_latest_active_idx;

alter table daily_coaching_decisions
  drop column if exists legacy_matches,
  drop column if exists resolution_duration_ms,
  drop column if exists prompt_version,
  drop column if exists ai_model,
  drop column if exists ai_provider,
  drop column if exists refinement_status;
