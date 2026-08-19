alter table users
  add column if not exists primary_barrier text,
  add column if not exists motivation_anchor text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_primary_barrier_check'
      and conrelid = 'users'::regclass
  ) then
    alter table users add constraint users_primary_barrier_check check (
      primary_barrier is null or primary_barrier in (
        'motivation_loss',
        'too_busy',
        'stress_or_fatigue',
        'unsure_what_to_do',
        'all_or_nothing'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_motivation_anchor_check'
      and conrelid = 'users'::regclass
  ) then
    alter table users add constraint users_motivation_anchor_check check (
      motivation_anchor is null or motivation_anchor in (
        'health',
        'family',
        'confidence',
        'capability',
        'milestone'
      )
    );
  end if;
end $$;
