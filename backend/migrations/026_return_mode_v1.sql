alter table users
  add column if not exists last_meaningful_activity_at timestamptz,
  add column if not exists return_mode_last_shown_at timestamptz,
  add column if not exists return_mode_shown_for_activity_at timestamptz;

create index if not exists users_return_mode_activity_idx
  on users(last_meaningful_activity_at)
  where status = 'active' and last_meaningful_activity_at is not null;

with meaningful_activity as (
  select user_id, created_at as occurred_at from food_logs
  union all select user_id, created_at from weight_logs
  union all select user_id, created_at from water_logs
  union all select user_id, created_at from progress_photos
  union all select user_id, created_at from habit_logs where completed = true
  union all select user_id, created_at from analytics_events where event_name = 'burn_log'
  union all select user_id, created_at from recovery_checkins
  union all select user_id, created_at from athlete_readiness_checkins
  union all select user_id, created_at from athlete_target_progress
  union all select user_id, created_at from body_composition_scans where user_confirmed = true
  union all select client_user_id as user_id, completed_at from trainer_missions
    where status = 'completed' and completed_at is not null
), latest_activity as (
  select user_id, max(occurred_at) as occurred_at
  from meaningful_activity
  group by user_id
)
update users u
set last_meaningful_activity_at = latest_activity.occurred_at
from latest_activity
where u.id = latest_activity.user_id
  and u.last_meaningful_activity_at is null;

create or replace function record_meaningful_member_activity()
returns trigger
language plpgsql
as $$
declare
  activity_user_id uuid;
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
begin
  if tg_table_name = 'analytics_events' and new_row->>'event_name' <> 'burn_log' then
    return new;
  end if;

  if tg_table_name = 'habit_logs' then
    if coalesce((new_row->>'completed')::boolean, false) = false then
      return new;
    end if;
    if tg_op = 'UPDATE' and coalesce((old_row->>'completed')::boolean, false) = true then
      return new;
    end if;
  end if;

  if tg_table_name = 'body_composition_scans' then
    if coalesce((new_row->>'user_confirmed')::boolean, false) = false then
      return new;
    end if;
    if tg_op = 'UPDATE' and coalesce((old_row->>'user_confirmed')::boolean, false) = true then
      return new;
    end if;
  end if;

  if tg_table_name = 'trainer_missions' then
    if new_row->>'status' <> 'completed'
      or (tg_op = 'UPDATE' and old_row->>'status' = 'completed') then
      return new;
    end if;
    activity_user_id := nullif(new_row->>'client_user_id', '')::uuid;
  else
    activity_user_id := nullif(new_row->>'user_id', '')::uuid;
  end if;

  if activity_user_id is null then
    return new;
  end if;

  update users
  set last_meaningful_activity_at = greatest(
    coalesce(last_meaningful_activity_at, '-infinity'::timestamptz),
    clock_timestamp()
  )
  where id = activity_user_id;

  return new;
end;
$$;

drop trigger if exists food_logs_meaningful_activity on food_logs;
create trigger food_logs_meaningful_activity
after insert on food_logs
for each row execute function record_meaningful_member_activity();

drop trigger if exists weight_logs_meaningful_activity on weight_logs;
create trigger weight_logs_meaningful_activity
after insert on weight_logs
for each row execute function record_meaningful_member_activity();

drop trigger if exists water_logs_meaningful_activity on water_logs;
create trigger water_logs_meaningful_activity
after insert on water_logs
for each row execute function record_meaningful_member_activity();

drop trigger if exists progress_photos_meaningful_activity on progress_photos;
create trigger progress_photos_meaningful_activity
after insert on progress_photos
for each row execute function record_meaningful_member_activity();

drop trigger if exists habit_logs_meaningful_activity on habit_logs;
create trigger habit_logs_meaningful_activity
after insert or update of completed on habit_logs
for each row execute function record_meaningful_member_activity();

drop trigger if exists burn_logs_meaningful_activity on analytics_events;
create trigger burn_logs_meaningful_activity
after insert on analytics_events
for each row execute function record_meaningful_member_activity();

drop trigger if exists recovery_checkins_meaningful_activity on recovery_checkins;
create trigger recovery_checkins_meaningful_activity
after insert or update of sleep_quality on recovery_checkins
for each row execute function record_meaningful_member_activity();

drop trigger if exists athlete_readiness_meaningful_activity on athlete_readiness_checkins;
create trigger athlete_readiness_meaningful_activity
after insert or update on athlete_readiness_checkins
for each row execute function record_meaningful_member_activity();

drop trigger if exists athlete_target_progress_meaningful_activity on athlete_target_progress;
create trigger athlete_target_progress_meaningful_activity
after insert or update on athlete_target_progress
for each row execute function record_meaningful_member_activity();

drop trigger if exists body_composition_scans_meaningful_activity on body_composition_scans;
create trigger body_composition_scans_meaningful_activity
after insert or update of user_confirmed on body_composition_scans
for each row execute function record_meaningful_member_activity();

drop trigger if exists trainer_missions_meaningful_activity on trainer_missions;
create trigger trainer_missions_meaningful_activity
after insert or update of status on trainer_missions
for each row execute function record_meaningful_member_activity();
