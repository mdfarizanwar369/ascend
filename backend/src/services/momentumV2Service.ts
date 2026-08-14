import { GoalType } from "@ascend/shared";
import { query } from "../db/pool";
import { calculateMomentumV2, MomentumDay } from "../domain/momentumV2";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { normalizeTimeZone, userLocalDateKey } from "../utils/userTime";

type DailyRow = {
  day: string;
  meals: string;
  calories: string;
  protein_g: string;
  water_ml: string;
  workouts: string;
  active_minutes: string;
  steps: string;
  active_calories: string;
  sleep_quality: MomentumDay["sleepQuality"];
  focus_assigned: string;
  focus_completed: string;
};

export async function calculateAndStoreMomentumV2(userId: string) {
  const profileResult = await query<{ goal_type: GoalType | null; created_at: string; timezone: string | null }>(
    "select u.goal_type, u.created_at, coalesce(u.timezone, g.timezone, 'Asia/Kuala_Lumpur') as timezone from users u left join gyms g on g.id = u.gym_id where u.id = $1",
    [userId]
  );
  const timezone = normalizeTimeZone(profileResult.rows[0]?.timezone);
  const [targets, activityResult] = await Promise.all([
    resolveNutritionTargets(userId),
    query<DailyRow>(
      `
      with days as (
        select generate_series((now() at time zone $2)::date - interval '6 days', (now() at time zone $2)::date, interval '1 day')::date as day
      ),
      food as (
        select (logged_at at time zone $2)::date as day, count(*) as meals, coalesce(sum(calories), 0) as calories,
          coalesce(sum(protein_g), 0) as protein_g
        from food_logs where user_id = $1 and (logged_at at time zone $2)::date >= (now() at time zone $2)::date - interval '6 days'
        group by (logged_at at time zone $2)::date
      ),
      water as (
        select (logged_at at time zone $2)::date as day, coalesce(sum(amount_ml), 0) as water_ml
        from water_logs where user_id = $1 and (logged_at at time zone $2)::date >= (now() at time zone $2)::date - interval '6 days'
        group by (logged_at at time zone $2)::date
      ),
      burns as (
        select (created_at at time zone $2)::date as day, count(*) as workouts,
          coalesce(sum(case when coalesce(metadata->>'durationMinutes', '') ~ '^[0-9.]+$' then (metadata->>'durationMinutes')::numeric else 0 end), 0) as active_minutes,
          coalesce(sum(case when coalesce(metadata->>'caloriesBurned', '') ~ '^[0-9.]+$' then (metadata->>'caloriesBurned')::numeric else 0 end), 0) as active_calories
        from analytics_events
        where user_id = $1 and event_name = 'burn_log' and (created_at at time zone $2)::date >= (now() at time zone $2)::date - interval '6 days'
        group by (created_at at time zone $2)::date
      ),
      health as (
        select recorded_on as day,
          coalesce(sum(value_numeric) filter (where record_type = 'steps_daily'), 0) as steps,
          coalesce(sum(value_numeric) filter (where record_type = 'active_calories_daily'), 0) as active_calories,
          count(*) filter (where record_type = 'exercise_session') as workouts
        from health_sync_records
        where user_id = $1 and recorded_on >= (now() at time zone $2)::date - interval '6 days'
        group by recorded_on
      ),
      focus_habits as (
        select d.day,
          count(distinct h.id) as assigned,
          count(distinct hl.habit_id) filter (where hl.completed = true) as completed
        from days d
        join habits h on h.user_id = $1 and h.active = true
          and lower(h.name) !~ '(meal|food|protein|water|hydrat|workout|exercise|steps|sleep)'
          and (h.created_at at time zone $2)::date <= d.day
        left join habit_logs hl on hl.user_id = $1 and hl.habit_id = h.id and (hl.logged_at at time zone $2)::date = d.day
        group by d.day
      ),
      missions as (
        select due_date::date as day, count(*) as assigned,
          count(*) filter (where status = 'completed') as completed
        from trainer_missions
        where client_user_id = $1 and due_date::date >= (now() at time zone $2)::date - interval '6 days' and due_date::date <= (now() at time zone $2)::date
        group by due_date::date
      )
      select d.day::text,
        coalesce(f.meals, 0)::text as meals,
        coalesce(f.calories, 0)::text as calories,
        coalesce(f.protein_g, 0)::text as protein_g,
        coalesce(w.water_ml, 0)::text as water_ml,
        greatest(coalesce(b.workouts, 0), coalesce(h.workouts, 0))::text as workouts,
        coalesce(b.active_minutes, 0)::text as active_minutes,
        coalesce(h.steps, 0)::text as steps,
        greatest(coalesce(b.active_calories, 0), coalesce(h.active_calories, 0))::text as active_calories,
        rc.sleep_quality,
        (coalesce(fh.assigned, 0) + coalesce(m.assigned, 0))::text as focus_assigned,
        (coalesce(fh.completed, 0) + coalesce(m.completed, 0))::text as focus_completed
      from days d
      left join food f on f.day = d.day
      left join water w on w.day = d.day
      left join burns b on b.day = d.day
      left join health h on h.day = d.day
      left join focus_habits fh on fh.day = d.day
      left join missions m on m.day = d.day
      left join recovery_checkins rc on rc.user_id = $1 and rc.checkin_date = d.day
      order by d.day
      `,
      [userId, timezone]
    )
  ]);

  const profile = profileResult.rows[0];
  const createdDate = profile?.created_at ? userLocalDateKey(new Date(profile.created_at), timezone) : activityResult.rows[0]?.day;
  const filteredRows = activityResult.rows.filter((row) => !createdDate || row.day >= createdDate);
  const rows = filteredRows.length ? filteredRows : activityResult.rows.slice(-1);
  const days: MomentumDay[] = rows.map((row, index) => ({
    date: row.day,
    weight: 1 + index * 0.12,
    meals: Number(row.meals),
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    waterMl: Number(row.water_ml),
    workouts: Number(row.workouts),
    activeMinutes: Number(row.active_minutes),
    steps: Number(row.steps),
    activeCalories: Number(row.active_calories),
    sleepQuality: row.sleep_quality,
    focusAssigned: Number(row.focus_assigned),
    focusCompleted: Number(row.focus_completed)
  }));
  const score = calculateMomentumV2({
    goal: profile?.goal_type ?? null,
    calorieTarget: targets.calories,
    proteinTargetG: targets.proteinG,
    waterTargetMl: targets.waterMl,
    days
  });

  const stored = await query(
    `
    insert into momentum_scores_v2 (
      user_id, score, fuel_score, move_score, recover_score, focus_score,
      fuel_status, move_status, recover_status, focus_status, focus_active,
      period_start, period_end, calculated_for_date
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,(now() at time zone $14)::date)
    on conflict (user_id, calculated_for_date) do update set
      score = excluded.score, fuel_score = excluded.fuel_score, move_score = excluded.move_score,
      recover_score = excluded.recover_score, focus_score = excluded.focus_score,
      fuel_status = excluded.fuel_status, move_status = excluded.move_status,
      recover_status = excluded.recover_status, focus_status = excluded.focus_status,
      focus_active = excluded.focus_active, period_start = excluded.period_start,
      period_end = excluded.period_end, updated_at = now()
    returning *
    `,
    [userId, score.score, score.fuelScore, score.moveScore, score.recoverScore, score.focusScore,
      score.fuelStatus, score.moveStatus, score.recoverStatus, score.focusStatus, score.focusActive,
      score.periodStart, score.periodEnd, timezone]
  );

  await query(
    `
    insert into compliance_scores (user_id, score, food_score, weight_score, water_score, habit_score, calculated_for_date)
    values ($1,$2,$3,$4,$5,$6,(now() at time zone $7)::date)
    on conflict (user_id, calculated_for_date) do update set
      score = excluded.score, food_score = excluded.food_score, weight_score = excluded.weight_score,
      water_score = excluded.water_score, habit_score = excluded.habit_score, created_at = now()
    `,
    [userId, score.score, score.fuelScore, score.moveScore, score.recoverScore, score.focusScore ?? 0, timezone]
  );

  return stored.rows[0];
}
