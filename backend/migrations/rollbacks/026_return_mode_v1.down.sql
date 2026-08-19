drop trigger if exists trainer_missions_meaningful_activity on trainer_missions;
drop trigger if exists body_composition_scans_meaningful_activity on body_composition_scans;
drop trigger if exists athlete_target_progress_meaningful_activity on athlete_target_progress;
drop trigger if exists athlete_readiness_meaningful_activity on athlete_readiness_checkins;
drop trigger if exists recovery_checkins_meaningful_activity on recovery_checkins;
drop trigger if exists burn_logs_meaningful_activity on analytics_events;
drop trigger if exists habit_logs_meaningful_activity on habit_logs;
drop trigger if exists progress_photos_meaningful_activity on progress_photos;
drop trigger if exists water_logs_meaningful_activity on water_logs;
drop trigger if exists weight_logs_meaningful_activity on weight_logs;
drop trigger if exists food_logs_meaningful_activity on food_logs;

drop function if exists record_meaningful_member_activity();
drop index if exists users_return_mode_activity_idx;

alter table users
  drop column if exists return_mode_shown_for_activity_at,
  drop column if exists return_mode_last_shown_at,
  drop column if exists last_meaningful_activity_at;
