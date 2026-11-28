create extension if not exists btree_gist;

create table pt_weekly_availability (
  trainer_id uuid not null references trainers(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  primary key (trainer_id, weekday),
  check (closes_at - opens_at >= interval '1 hour')
);

create table pt_bookings (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid not null references gyms(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  client_id uuid not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at = starts_at + interval '1 hour'),
  exclude using gist (trainer_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed'),
  exclude using gist (client_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed')
);

create unique index pt_bookings_open_request_idx
  on pt_bookings (client_id, trainer_id, starts_at) where status in ('pending', 'confirmed');
create index pt_bookings_client_week_idx on pt_bookings (client_id, starts_at);
create index pt_bookings_trainer_week_idx on pt_bookings (trainer_id, starts_at);
create index pt_bookings_gym_week_idx on pt_bookings (gym_id, starts_at);

create function pt_cancel_bookings_on_assignment_change() returns trigger
language plpgsql as $$
begin
  update pt_bookings set status = 'cancelled', updated_at = now()
  where client_id = new.id and starts_at > now() and status in ('pending', 'confirmed');
  return new;
end;
$$;

create trigger pt_booking_assignment_change
after update of assigned_trainer_id, gym_id, status, primary_role on users
for each row
when (old.primary_role = 'client' and (
  old.assigned_trainer_id is distinct from new.assigned_trainer_id
  or old.gym_id is distinct from new.gym_id
  or old.status is distinct from new.status
  or old.primary_role is distinct from new.primary_role
))
execute function pt_cancel_bookings_on_assignment_change();

create function pt_cancel_bookings_on_trainer_change() returns trigger
language plpgsql as $$
begin
  update pt_bookings set status = 'cancelled', updated_at = now()
  where trainer_id = new.id and starts_at > now() and status in ('pending', 'confirmed');
  return new;
end;
$$;

create trigger pt_booking_trainer_change
after update of gym_id, status on trainers
for each row
when (old.gym_id is distinct from new.gym_id or old.status is distinct from new.status)
execute function pt_cancel_bookings_on_trainer_change();
