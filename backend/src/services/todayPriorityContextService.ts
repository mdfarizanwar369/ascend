import { query } from "../db/pool";
import { getHealthSyncSummary } from "./healthSyncService";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { localCalendarDaysSince, TodayPriorityFacts } from "./todayPriorityService";

const DAY_MS = 86_400_000;

export type TodayPriorityDayContext = {
  localDate: string;
  localHour: number;
  dayStartUtc: Date;
  dayEndUtc: Date;
};

export function buildTodayPriorityDayContext(timezoneOffsetMinutes: number, nowMs = Date.now()): TodayPriorityDayContext {
  const localNow = new Date(nowMs - timezoneOffsetMinutes * 60_000);
  const dayStartUtc = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
      + timezoneOffsetMinutes * 60_000
  );
  return {
    localDate: localNow.toISOString().slice(0, 10),
    localHour: localNow.getUTCHours(),
    dayStartUtc,
    dayEndUtc: new Date(dayStartUtc.getTime() + DAY_MS)
  };
}

export async function loadTodayPriorityFacts(
  userId: string,
  timezoneOffsetMinutes: number,
  nowMs = Date.now()
): Promise<{ context: TodayPriorityDayContext; facts: TodayPriorityFacts }> {
  const context = buildTodayPriorityDayContext(timezoneOffsetMinutes, nowMs);
  const startIso = context.dayStartUtc.toISOString();
  const endIso = context.dayEndUtc.toISOString();
  const [foodResult, waterResult, workoutResult, recoveryResult, nutritionTargets, healthSyncSummary] = await Promise.all([
    query<{ meals: number; protein_g: number | string }>(`
      select count(*)::int as meals, coalesce(sum(protein_g), 0) as protein_g
      from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3
    `, [userId, startIso, endIso]),
    query<{ water_ml: number | string }>(`
      select coalesce(sum(amount_ml), 0) as water_ml
      from water_logs where user_id = $1 and logged_at >= $2 and logged_at < $3
    `, [userId, startIso, endIso]),
    query<{ latest_at: string | null; completed_today: boolean }>(`
      select max(created_at) as latest_at,
        coalesce(bool_or(created_at >= $2 and created_at < $3), false) as completed_today
      from analytics_events where user_id = $1 and event_name = 'burn_log'
    `, [userId, startIso, endIso]),
    query<{ sleep_quality: "poor" | "okay" | "good" | null }>(`
      select sleep_quality from recovery_checkins
      where user_id = $1 and checkin_date = $2::date
      limit 1
    `, [userId, context.localDate]),
    resolveNutritionTargets(userId),
    getHealthSyncSummary(userId).catch(() => null)
  ]);

  const latestWorkoutAt = workoutResult.rows[0]?.latest_at
    ? new Date(workoutResult.rows[0].latest_at).getTime()
    : null;
  const latestSyncedWorkoutAt = healthSyncSummary?.latestWorkoutAt
    ? new Date(healthSyncSummary.latestWorkoutAt).getTime()
    : null;
  const latestMovementAt = Math.max(latestWorkoutAt ?? 0, latestSyncedWorkoutAt ?? 0) || null;

  return {
    context,
    facts: {
      localHour: context.localHour,
      mealsToday: Number(foodResult.rows[0]?.meals ?? 0),
      proteinTodayG: Number(foodResult.rows[0]?.protein_g ?? 0),
      proteinTargetG: nutritionTargets.proteinG,
      waterTodayMl: Number(waterResult.rows[0]?.water_ml ?? 0),
      waterTargetMl: nutritionTargets.waterMl,
      workoutCompletedToday: Boolean(workoutResult.rows[0]?.completed_today) || healthSyncSummary?.workoutCompletedToday === true,
      daysSinceWorkout: latestMovementAt === null
        ? null
        : localCalendarDaysSince(latestMovementAt, timezoneOffsetMinutes, nowMs),
      stepsToday: healthSyncSummary?.todaySteps ?? 0,
      activeCaloriesToday: healthSyncSummary?.todayActiveCalories ?? 0,
      sleepQuality: recoveryResult.rows[0]?.sleep_quality ?? null
    }
  };
}
