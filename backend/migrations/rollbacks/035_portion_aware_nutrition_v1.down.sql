drop index if exists food_logs_portion_analysis_version_idx;

alter table food_logs
  drop column if exists portion_adjusted_by_user,
  drop column if exists photo_analysis_version,
  drop column if exists portion_analysis;

alter table local_food_items
  drop constraint if exists local_food_items_nutrition_basis_unit_check,
  drop column if exists nutrition_basis_source,
  drop column if exists nutrition_basis_unit,
  drop column if exists nutrition_basis_amount;
