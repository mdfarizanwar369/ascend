import { query } from "../db/pool";

export type Client360ProfileRow = {
  id: string;
  full_name: string;
  goal_type: "fat_loss" | "muscle_gain" | "maintenance" | null;
  activity_level: string | null;
  created_at: string;
};

export type Client360TrainingAggregateRow = {
  client_created_at: string;
  count_7d: string | number;
  count_30d: string | number;
  count_90d: string | number;
  current_28d: string | number;
  previous_28d: string | number;
  active_weeks_8: string | number;
  last_workout_at: string | null;
  duration_count_30d: string | number;
  average_duration_30d: string | number | null;
};

export type Client360RecentWorkoutRow = {
  id: string;
  created_at: string;
  workout_title: string | null;
  workout_type: string | null;
  duration_minutes: string | number | null;
  exercise_count: string | number;
  recorded_sets: string | number | null;
  source: string | null;
  debrief_available: boolean;
};

export type Client360NutritionDayRow = {
  logged_date: string | null;
  calories: string | number | null;
  protein_g: string | number | null;
  goal_type: Client360ProfileRow["goal_type"];
};

export type Client360WeightRow = { weight_kg: string | number; logged_at: string };

export type Client360ActivityRow = {
  connected: boolean;
  last_synced_at: string | null;
  today_steps: string | number | null;
  steps_days_7d: string | number;
  average_steps_7d: string | number | null;
  exercise_sessions_7d: string | number;
  last_exercise_session_at: string | null;
};

export async function loadClient360Profile(clientId: string) {
  const result = await query<Client360ProfileRow>(
    `select id, full_name, goal_type, activity_level, created_at from users where id = $1 and status = 'active'`,
    [clientId]
  );
  return result.rows[0] ?? null;
}

export async function loadClient360Training(clientId: string) {
  const [aggregate, recent] = await Promise.all([
    query<Client360TrainingAggregateRow>(`
      select
        (select created_at from users where id = $1) as client_created_at,
        count(*) filter (where created_at >= now() - interval '7 days') as count_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as count_30d,
        count(*) filter (where created_at >= now() - interval '90 days') as count_90d,
        count(*) filter (where created_at >= now() - interval '28 days') as current_28d,
        count(*) filter (where created_at >= now() - interval '56 days' and created_at < now() - interval '28 days') as previous_28d,
        count(distinct date_trunc('week', created_at)) filter (where created_at >= now() - interval '56 days') as active_weeks_8,
        max(created_at) as last_workout_at,
        count(*) filter (
          where created_at >= now() - interval '30 days'
            and jsonb_typeof(metadata->'durationMinutes') = 'number'
            and (metadata->>'durationMinutes')::numeric > 0
        ) as duration_count_30d,
        avg((metadata->>'durationMinutes')::numeric) filter (
          where created_at >= now() - interval '30 days'
            and jsonb_typeof(metadata->'durationMinutes') = 'number'
            and (metadata->>'durationMinutes')::numeric > 0
        ) as average_duration_30d
      from analytics_events
      where user_id = $1 and event_name = 'burn_log'
    `, [clientId]),
    query<Client360RecentWorkoutRow>(`
      select event.id, event.created_at,
        nullif(event.metadata->>'workoutTitle', '') as workout_title,
        nullif(event.metadata->>'workoutType', '') as workout_type,
        case when jsonb_typeof(event.metadata->'durationMinutes') = 'number' then (event.metadata->>'durationMinutes')::numeric end as duration_minutes,
        case when jsonb_typeof(event.metadata->'exercises') = 'array' then jsonb_array_length(event.metadata->'exercises') else 0 end as exercise_count,
        case when jsonb_typeof(event.metadata->'exercises') = 'array' then (
          select sum(coalesce(
            case when jsonb_typeof(exercise->'completedSets') = 'number' then (exercise->>'completedSets')::numeric end,
            case when jsonb_typeof(exercise->'sets') = 'number' then (exercise->>'sets')::numeric end,
            0
          )) from jsonb_array_elements(event.metadata->'exercises') exercise
        ) end as recorded_sets,
        nullif(event.metadata->>'source', '') as source,
        exists (select 1 from workout_debriefs debrief where debrief.workout_event_id = event.id) as debrief_available
      from analytics_events event
      where event.user_id = $1 and event.event_name = 'burn_log'
      order by event.created_at desc limit 10
    `, [clientId])
  ]);
  return { aggregate: aggregate.rows[0], recent: recent.rows };
}

export async function loadClient360NutritionDays(clientId: string) {
  const result = await query<Client360NutritionDayRow>(`
    select profile.goal_type, daily.logged_date, daily.calories, daily.protein_g
    from users profile
    left join lateral (
      select (logged_at at time zone 'UTC')::date::text as logged_date,
        sum(calories) as calories, sum(protein_g) as protein_g
      from food_logs
      where user_id = profile.id
        and (logged_at at time zone 'UTC')::date >= (now() at time zone 'UTC')::date - 29
      group by (logged_at at time zone 'UTC')::date
      order by (logged_at at time zone 'UTC')::date desc
    ) daily on true
    where profile.id = $1
    order by daily.logged_date desc nulls last
  `, [clientId]);
  return result.rows;
}

export async function loadClient360Weights(clientId: string) {
  const result = await query<Client360WeightRow>(`
    select weight_kg, logged_at from weight_logs
    where user_id = $1 and logged_at >= now() - interval '120 days'
    order by logged_at desc limit 200
  `, [clientId]);
  return result.rows;
}

export async function loadClient360BodyScans(clientId: string) {
  const result = await query<Record<string, unknown>>(`
    select * from body_composition_scans
    where user_id = $1 and user_confirmed = true and experience_scope = 'athlete'
    order by scan_date desc, created_at desc limit 10
  `, [clientId]);
  return result.rows;
}

export async function loadClient360Activity(clientId: string) {
  const result = await query<Client360ActivityRow>(`
    select
      coalesce(connection.status = 'connected', false) as connected,
      connection.last_synced_at,
      (select sum(record.value_numeric) from health_sync_records record
       where record.user_id = $1 and record.record_type = 'steps_daily' and record.recorded_on = current_date) as today_steps,
      (select count(distinct record.recorded_on) from health_sync_records record
       where record.user_id = $1 and record.record_type = 'steps_daily' and record.recorded_on >= current_date - interval '6 days') as steps_days_7d,
      (select avg(day.total_steps) from (
         select record.recorded_on, sum(record.value_numeric) as total_steps
         from health_sync_records record
         where record.user_id = $1 and record.record_type = 'steps_daily' and record.recorded_on >= current_date - interval '6 days'
         group by record.recorded_on
       ) day) as average_steps_7d,
      (select count(*) from health_sync_records record
       where record.user_id = $1 and record.record_type = 'exercise_session' and record.start_at >= now() - interval '7 days') as exercise_sessions_7d,
      (select max(record.start_at) from health_sync_records record
       where record.user_id = $1 and record.record_type = 'exercise_session') as last_exercise_session_at
    from (select $1::uuid as user_id) client
    left join health_sync_connections connection on connection.user_id = client.user_id
  `, [clientId]);
  return result.rows[0];
}

export type Client360RelationshipListRow = {
  client_id: string;
  relationship_id: string;
  authorization_version: string | number;
  data_scopes: string[];
};

export async function loadActiveClient360Relationships(trainerId: string) {
  const result = await query<Client360RelationshipListRow>(`
    select relationship.client_user_id as client_id, relationship.id as relationship_id,
      relationship.authorization_version, relationship.data_scopes
    from trainer_client_relationships relationship
    join users client on client.id = relationship.client_user_id and client.status = 'active'
    where relationship.trainer_id = $1 and relationship.status = 'active'
    order by relationship.updated_at desc
    limit 250
  `, [trainerId]);
  return result.rows;
}

export async function loadClient360ListProfiles(clientIds: string[]) {
  if (!clientIds.length) return [];
  const result = await query<{ id: string; full_name: string; goal_type: Client360ProfileRow["goal_type"] }>(
    `select id, full_name, goal_type from users where id = any($1::uuid[])`, [clientIds]
  );
  return result.rows;
}

export async function loadClient360ListWorkoutDates(clientIds: string[]) {
  if (!clientIds.length) return [];
  const result = await query<{ id: string; last_workout_at: string | null }>(`
    select client.id, max(event.created_at) as last_workout_at
    from unnest($1::uuid[]) as client(id)
    left join analytics_events event on event.user_id = client.id and event.event_name = 'burn_log'
    group by client.id
  `, [clientIds]);
  return result.rows;
}
