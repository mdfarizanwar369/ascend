create table if not exists member_nutrition_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  mode text not null default 'ascend' check (mode in ('ascend', 'custom')),
  calories integer check (calories between 1200 and 5000),
  protein_g integer check (protein_g between 30 and 400),
  carbs_g integer check (carbs_g between 0 and 700),
  fat_g integer check (fat_g between 20 and 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    mode = 'ascend'
    or (calories is not null and protein_g is not null and carbs_g is not null and fat_g is not null)
  )
);
