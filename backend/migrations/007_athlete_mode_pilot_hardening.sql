alter table athlete_profiles
  add column if not exists timezone text;

alter table athlete_weekly_targets
  add column if not exists cadence text not null default 'weekly';

alter table athlete_weekly_targets
  drop constraint if exists athlete_target_type_value;

alter table athlete_weekly_targets
  add constraint athlete_target_type_value check (
    target_type in (
      'steps', 'cardio_minutes', 'training_sessions', 'water_ml', 'runs',
      'strength_sessions', 'mobility_sessions', 'recovery_days', 'custom'
    )
  );

alter table athlete_weekly_targets
  drop constraint if exists athlete_weekly_targets_user_id_week_start_target_type_key;

alter table athlete_weekly_targets
  drop constraint if exists athlete_target_cadence_value;

alter table athlete_weekly_targets
  add constraint athlete_target_cadence_value check (cadence in ('daily', 'weekly'));

create unique index if not exists athlete_targets_user_week_type_cadence_idx
  on athlete_weekly_targets(user_id, week_start, target_type, cadence);

alter table athlete_profiles
  drop constraint if exists athlete_profile_timezone_length;

alter table athlete_profiles
  add constraint athlete_profile_timezone_length check (timezone is null or char_length(timezone) <= 80);
