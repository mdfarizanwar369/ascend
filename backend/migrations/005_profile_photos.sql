alter table users
  add column if not exists profile_photo_s3_key text;

