update gyms
set
  name = 'Peak Performance Fitness - Central',
  slug = 'peak-performance-fitness-central',
  location = 'Central, Johor'
where name = 'Anytime Fitness Austin Green'
   or slug = 'anytime-fitness-austin-green';

update gyms
set
  name = 'Peak Performance Fitness - North',
  slug = 'peak-performance-fitness-north',
  location = 'North, Johor'
where name = 'Anytime Fitness Kulai Indahpura'
   or slug = 'anytime-fitness-kulai-indahpura';

do $$
declare
  old_code_id uuid;
  new_code_id uuid;
begin
  select id into old_code_id from referral_codes where code = 'AF-AUSTIN';
  select id into new_code_id from referral_codes where code = 'PPF-CENTRAL';

  if old_code_id is not null and new_code_id is null then
    update referral_codes set code = 'PPF-CENTRAL' where id = old_code_id;
  elsif old_code_id is not null and new_code_id is not null then
    update subscriptions set referral_code_id = new_code_id where referral_code_id = old_code_id;
    delete from referral_codes where id = old_code_id;
  end if;

  select id into old_code_id from referral_codes where code = 'AF-KULAI';
  select id into new_code_id from referral_codes where code = 'PPF-NORTH';

  if old_code_id is not null and new_code_id is null then
    update referral_codes set code = 'PPF-NORTH' where id = old_code_id;
  elsif old_code_id is not null and new_code_id is not null then
    update subscriptions set referral_code_id = new_code_id where referral_code_id = old_code_id;
    delete from referral_codes where id = old_code_id;
  end if;
end $$;
