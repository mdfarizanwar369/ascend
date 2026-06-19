create table if not exists gym_owner_assignments (
  user_id uuid not null references users(id) on delete cascade,
  gym_id uuid not null references gyms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);

create index if not exists gym_owner_assignments_gym_idx on gym_owner_assignments(gym_id);

insert into gym_owner_assignments (user_id, gym_id)
select owner_user_id, id
from gyms
where owner_user_id is not null
on conflict do nothing;

insert into gym_owner_assignments (user_id, gym_id)
select id, gym_id
from users
where primary_role = 'owner' and gym_id is not null
on conflict do nothing;
