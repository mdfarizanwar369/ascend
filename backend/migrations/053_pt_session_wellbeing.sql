create table pt_session_wellbeing (
  booking_id uuid primary key references pt_bookings(id) on delete cascade,
  booking_version integer not null,
  feeling text check (feeling in ('good', 'low_energy', 'sore', 'uncomfortable')),
  preference text check (preference in ('lighter', 'talk_first')),
  expires_at timestamptz not null,
  check (feeling is not null or preference is not null)
);

create index pt_session_wellbeing_expiry_idx on pt_session_wellbeing (expires_at);

create function pt_remove_wellbeing_after_booking_change() returns trigger language plpgsql as $$
begin
  delete from pt_session_wellbeing where booking_id = new.id;
  return new;
end;
$$;

create trigger pt_session_wellbeing_booking_change
after update of version, status, starts_at on pt_bookings
for each row
when (old.version is distinct from new.version
  or old.status is distinct from new.status
  or old.starts_at is distinct from new.starts_at)
execute function pt_remove_wellbeing_after_booking_change();
