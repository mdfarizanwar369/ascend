alter table local_food_items
  add column if not exists nutrition_basis_amount numeric(8,2),
  add column if not exists nutrition_basis_unit text,
  add column if not exists nutrition_basis_source text;

alter table local_food_items
  drop constraint if exists local_food_items_nutrition_basis_unit_check;

alter table local_food_items
  add constraint local_food_items_nutrition_basis_unit_check
  check (nutrition_basis_unit is null or nutrition_basis_unit in ('g', 'ml', 'piece', 'slice', 'serving'));

alter table food_logs
  add column if not exists portion_analysis jsonb,
  add column if not exists photo_analysis_version text,
  add column if not exists portion_adjusted_by_user boolean not null default false;

create index if not exists food_logs_portion_analysis_version_idx
  on food_logs(photo_analysis_version)
  where photo_analysis_version is not null;
