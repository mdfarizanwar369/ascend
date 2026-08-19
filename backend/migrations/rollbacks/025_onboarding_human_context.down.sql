alter table users
  drop column if exists motivation_anchor,
  drop column if exists primary_barrier;
