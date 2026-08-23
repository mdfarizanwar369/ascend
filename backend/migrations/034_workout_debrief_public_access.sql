update workout_debriefs
set status = 'available', updated_at = now()
where status = 'pending' and generation_started_at is null;

alter table workout_debriefs
  drop constraint if exists workout_debriefs_status_check;

alter table workout_debriefs
  add constraint workout_debriefs_status_check
  check (status in ('available', 'pending', 'generating', 'generated', 'fallback', 'not_required'));

create index if not exists workout_debriefs_user_generation_started_idx
  on workout_debriefs(user_id, generation_started_at desc)
  where generation_started_at is not null;
