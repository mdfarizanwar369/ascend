create table if not exists coach_nutrition_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'active',
  plan_label text,
  calories integer not null check (calories between 800 and 8000),
  protein_g integer not null check (protein_g between 0 and 500),
  carbs_g integer not null check (carbs_g between 0 and 1000),
  fat_g integer not null check (fat_g between 0 and 400),
  coach_note text,
  phase_type text,
  schedule_type text not null default 'everyday',
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists coach_nutrition_plans_one_active_per_user_idx
  on coach_nutrition_plans(user_id)
  where status = 'active';

create index if not exists coach_nutrition_plans_user_status_idx
  on coach_nutrition_plans(user_id, status, updated_at desc);
