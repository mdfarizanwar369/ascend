alter table users
  add column if not exists preferred_locale text not null default 'en';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_preferred_locale_check'
  ) then
    alter table users add constraint users_preferred_locale_check
      check (preferred_locale in ('en', 'ms-MY', 'zh-Hans'));
  end if;
end $$;

create index if not exists users_preferred_locale_idx on users(preferred_locale);
