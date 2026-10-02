-- Aggregate pilot counters only: no member, workout, or health identifiers.
create table if not exists exercise_visual_pilot_counts (
  day_utc date not null default (now() at time zone 'utc')::date,
  event_type text not null,
  exercise_name text not null,
  registry_id text not null default '',
  event_count bigint not null default 0,
  primary key (day_utc, event_type, exercise_name, registry_id)
);
