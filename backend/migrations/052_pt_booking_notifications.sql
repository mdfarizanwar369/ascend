create table pt_booking_notifications (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references pt_bookings(id) on delete cascade,
  booking_version integer not null,
  kind text not null check (kind in ('trainer_request', 'client_reminder')),
  due_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > due_at),
  status text not null default 'queued'
    check (status in ('queued', 'dispatching', 'accepted', 'failed', 'unknown', 'skipped')),
  attempts smallint not null default 0,
  updated_at timestamptz not null default now(),
  unique (booking_id, booking_version, kind)
);

create index pt_booking_notifications_due_idx on pt_booking_notifications (due_at, id)
  where status = 'queued';
create index pt_booking_notifications_interrupted_idx on pt_booking_notifications (updated_at)
  where status = 'dispatching';

create function pt_sync_booking_notifications() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = new.status and old.starts_at = new.starts_at then
      return new;
    end if;
    update pt_booking_notifications set status = 'skipped', updated_at = now()
    where booking_id = new.id and status = 'queued';
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' and new.starts_at > now() then
    insert into pt_booking_notifications (booking_id, booking_version, kind, due_at, expires_at)
    values (new.id, new.version, 'trainer_request', now(), least(new.starts_at, now() + interval '1 hour'));
  elsif new.status = 'confirmed' and new.starts_at >= now() + interval '24 hours' then
    insert into pt_booking_notifications (booking_id, booking_version, kind, due_at, expires_at)
    values (new.id, new.version, 'client_reminder', new.starts_at - interval '24 hours', new.starts_at - interval '22 hours');
  end if;
  return new;
end;
$$;

create trigger pt_booking_notification_schedule
after insert or update of status, starts_at on pt_bookings
for each row execute function pt_sync_booking_notifications();

insert into pt_booking_notifications (booking_id, booking_version, kind, due_at, expires_at)
select id, version, 'client_reminder', starts_at - interval '24 hours', starts_at - interval '22 hours'
from pt_bookings where status = 'confirmed' and starts_at >= now() + interval '24 hours'
on conflict do nothing;
