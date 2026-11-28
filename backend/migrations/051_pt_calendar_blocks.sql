create table pt_calendar_blocks (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  gym_id uuid not null references gyms(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  repeat_pattern text not null check (repeat_pattern in ('none', 'daily', 'weekly')),
  check (starts_on <= ends_on),
  check (repeat_pattern = 'none' or starts_on = ends_on),
  check ((starts_at is null and ends_at is null) or
    (starts_at is not null and ends_at is not null and starts_on = ends_on and starts_at < ends_at))
);

create index pt_calendar_blocks_trainer_gym_idx on pt_calendar_blocks (trainer_id, gym_id);

create function pt_calendar_block_overlaps(
  block pt_calendar_blocks, session_start timestamptz, session_end timestamptz, gym_zone text
) returns boolean language sql stable strict as $$
  select case block.repeat_pattern
    when 'none' then true
    when 'weekly' then local_day >= block.starts_on and extract(isodow from local_day) = extract(isodow from block.starts_on)
    else local_day >= block.starts_on
  end
    and block_start < block_end
    and session_start < block_end and session_end > block_start
  from (select (session_start at time zone gym_zone)::date as local_day) day
  cross join lateral (
    select ((case when block.repeat_pattern = 'none' then block.starts_on else local_day end)
      + coalesce(block.starts_at, time '00:00')) at time zone gym_zone as block_start,
      ((case when block.repeat_pattern = 'none' then block.ends_on else local_day end)
      + coalesce(block.ends_at, time '24:00')) at time zone gym_zone as block_end
  ) bounds
$$;
