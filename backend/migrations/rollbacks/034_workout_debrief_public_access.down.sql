update workout_debriefs
set status = 'fallback',
    failure_reason = 'public_access_rollback',
    generated_at = coalesce(generated_at, now()),
    updated_at = now()
where status = 'available';

alter table workout_debriefs
  drop constraint if exists workout_debriefs_status_check;

alter table workout_debriefs
  add constraint workout_debriefs_status_check
  check (status in ('pending', 'generating', 'generated', 'fallback', 'not_required'));

drop index if exists workout_debriefs_user_generation_started_idx;
