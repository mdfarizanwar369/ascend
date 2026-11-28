alter table pt_bookings
  add column version integer not null default 1,
  add column client_update_id uuid unique,
  add column client_update_kind text check (client_update_kind in ('confirmed', 'moved')),
  add column client_update_read_at timestamptz;

create index pt_bookings_unread_client_idx on pt_bookings (client_id, starts_at)
  where client_update_id is not null and client_update_read_at is null and status = 'confirmed';

create index trainer_coaching_sessions_gym_recent_idx
  on trainer_coaching_sessions (gym_id, completed_at desc)
  where status = 'completed';
