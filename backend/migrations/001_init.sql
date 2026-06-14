create extension if not exists "uuid-ossp";

create type user_role as enum ('client', 'trainer', 'admin', 'owner');
create type goal_type as enum ('fat_loss', 'muscle_gain', 'maintenance');
create type referral_type as enum ('gym', 'trainer');
create type subscription_plan as enum ('free', 'premium', 'trainer_pro');
create type subscription_provider as enum ('toyyibpay', 'stripe', 'manual');
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'expired');
create type risk_alert_type as enum ('inactive_7_days', 'low_compliance', 'no_food_logs', 'weight_trend_off_goal');
create type risk_severity as enum ('low', 'medium', 'high');

create table gyms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  location text not null,
  country text not null default 'Malaysia',
  timezone text not null default 'Asia/Kuala_Lumpur',
  owner_user_id uuid,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default uuid_generate_v4(),
  firebase_uid text not null unique,
  email text not null unique,
  phone text,
  full_name text not null,
  avatar_url text,
  primary_role user_role not null default 'client',
  gym_id uuid references gyms(id),
  assigned_trainer_id uuid,
  referred_by_gym_id uuid references gyms(id),
  referred_by_trainer_id uuid,
  goal_type goal_type,
  height_cm numeric(5,2),
  starting_weight_kg numeric(5,2),
  target_weight_kg numeric(5,2),
  date_of_birth date,
  gender text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table gyms add constraint gyms_owner_user_fk foreign key (owner_user_id) references users(id);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role user_role not null,
  primary key (user_id, role)
);

create table trainers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,
  gym_id uuid not null references gyms(id),
  bio text,
  specialties text[] not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table users add constraint users_assigned_trainer_fk foreign key (assigned_trainer_id) references trainers(id);
alter table users add constraint users_referred_by_trainer_fk foreign key (referred_by_trainer_id) references trainers(id);

create table referral_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  type referral_type not null,
  gym_id uuid references gyms(id),
  trainer_id uuid references trainers(id),
  created_by_user_id uuid references users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint referral_owner_check check (
    (type = 'gym' and gym_id is not null) or
    (type = 'trainer' and trainer_id is not null)
  )
);

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  plan subscription_plan not null default 'free',
  provider subscription_provider not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  status subscription_status not null default 'active',
  amount_cents integer not null default 0,
  currency text not null default 'MYR',
  current_period_start timestamptz,
  current_period_end timestamptz,
  referral_code_id uuid references referral_codes(id),
  referred_by_gym_id uuid references gyms(id),
  referred_by_trainer_id uuid references trainers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_subscription_id)
);

create table payment_events (
  id uuid primary key default uuid_generate_v4(),
  provider subscription_provider not null,
  provider_reference text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table weight_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  weight_kg numeric(5,2) not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table water_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  amount_ml integer not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table food_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  image_s3_key text,
  meal_type text not null default 'lunch',
  description text,
  estimated_food_name text not null,
  calories integer not null,
  protein_g numeric(6,2) not null,
  carbs_g numeric(6,2) not null,
  fat_g numeric(6,2) not null,
  ai_estimate_raw jsonb,
  was_edited_by_user boolean not null default false,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table progress_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  image_s3_key text not null,
  photo_type text not null default 'front',
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  frequency text not null default 'daily',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default uuid_generate_v4(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  completed boolean not null default true,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table compliance_scores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  food_score integer not null,
  weight_score integer not null,
  water_score integer not null,
  habit_score integer not null,
  calculated_for_date date not null,
  created_at timestamptz not null default now(),
  unique(user_id, calculated_for_date)
);

create table risk_alerts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  trainer_id uuid references trainers(id),
  gym_id uuid references gyms(id),
  type risk_alert_type not null,
  severity risk_severity not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  sender_user_id uuid not null references users(id) on delete cascade,
  receiver_user_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table ai_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table weekly_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  trainer_id uuid references trainers(id),
  week_start date not null,
  week_end date not null,
  summary text not null,
  ai_generated_checkin text,
  compliance_score integer,
  created_at timestamptz not null default now()
);

create table analytics_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete set null,
  event_name text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table local_food_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  country text not null,
  aliases text[] not null default '{}',
  typical_calories integer not null,
  typical_protein_g numeric(6,2) not null,
  typical_carbs_g numeric(6,2) not null,
  typical_fat_g numeric(6,2) not null
);

create table if not exists food_estimate_cache (
  id uuid primary key default uuid_generate_v4(),
  image_hash text not null unique,
  estimate jsonb not null,
  provider text not null,
  model text,
  source text not null default 'ai',
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table if not exists ai_usage_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete set null,
  event_type text not null,
  provider text not null,
  model text,
  status text not null,
  cache_hit boolean not null default false,
  estimated_cost_cents numeric(10,4) not null default 0,
  input_units integer not null default 0,
  output_units integer not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index users_gym_id_idx on users(gym_id);
create index users_assigned_trainer_id_idx on users(assigned_trainer_id);
create index food_logs_user_logged_idx on food_logs(user_id, logged_at desc);
create index weight_logs_user_logged_idx on weight_logs(user_id, logged_at desc);
create index subscriptions_revenue_idx on subscriptions(status, referred_by_gym_id, referred_by_trainer_id);
create index risk_alerts_trainer_status_idx on risk_alerts(trainer_id, status);
create index if not exists ai_usage_events_created_idx on ai_usage_events(created_at desc);
create index if not exists ai_usage_events_type_created_idx on ai_usage_events(event_type, created_at desc);
create index if not exists food_estimate_cache_hash_idx on food_estimate_cache(image_hash);
