alter table pt_booking_notifications drop constraint pt_booking_notifications_kind_check;
alter table pt_booking_notifications add constraint pt_booking_notifications_kind_check
  check (kind in ('trainer_request', 'client_reminder', 'client_declined', 'client_cancelled', 'trainer_cancelled'));

create function pt_schedule_declined_alert() returns trigger language plpgsql as $$
begin
  if new.starts_at > now() then
    insert into pt_booking_notifications (booking_id, booking_version, kind, due_at, expires_at)
    values (new.id, new.version, 'client_declined', now(), now() + interval '1 hour');
  end if;
  return new;
end;
$$;

create trigger pt_booking_outcome_declined_alert
after update of status on pt_bookings
for each row when (old.status = 'pending' and new.status = 'declined')
execute function pt_schedule_declined_alert();
