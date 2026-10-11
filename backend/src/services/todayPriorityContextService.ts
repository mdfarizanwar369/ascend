import { query } from "../db/pool";
import type { DailyActivitySummary } from "@ascend/shared";
import { getDailyHealthActivity } from "./healthActivityService";
import { getHealthSyncSummary, type HealthSyncSummary } from "./healthSyncService";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { localCalendarDaysSince, TodayPriorityFacts } from "./todayPriorityService";

const DAY_MS = 86_400_000;

export type TodayPriorityDayContext = {
  localDate: string;
  localHour: number;
  dayStartUtc: Date;
  dayEndUtc: Date;
};

type TodayMovementFacts = {
  stepsToday: number;
  stepsAvailable: boolean;
  activeCaloriesToday: number;
  workoutCompletedToday: boolean;
  latestWorkoutAt: string | null;
};

export function resolveTodayMovementFacts(
  activitySummary: DailyActivitySummary | null,
  legacySummary: HealthSyncSummary | null
): TodayMovementFacts {
  if (activitySummary) {
    const stepsAvailable = typeof activitySummary.steps === "number" && Number.isFinite(activitySummary.steps);
    const activeCaloriesAvailable = typeof activitySummary.displayedCalories === "number"
      && Number.isFinite(activitySummary.displayedCalories);
    const workoutCompletedToday = activitySummary.workoutCount > 0;
    return {
      stepsToday: stepsAvailable ? Math.max(0, activitySummary.steps!) : 0,
      stepsAvailable,
      activeCaloriesToday: activeCaloriesAvailable ? Math.max(0, activitySummary.displayedCalories!) : 0,
      workoutCompletedToday,
      // The daily ledger does not expose an individual latest-workout timestamp.
      // A workout in today's summary is sufficient to establish zero local days.
      latestWorkoutAt: workoutCompletedToday ? activitySummary.observedAt : null
    };
  }

  return {
    stepsToday: legacySummary?.todaySteps ?? 0,
    stepsAvailable: legacySummary?.connected === true,
    activeCaloriesToday: legacySummary?.todayActiveCalories ?? 0,
    workoutCompletedToday: legacySummary?.workoutCompletedToday === true,
    latestWorkoutAt: legacySummary?.latestWorkoutAt ?? null
  };
}

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
  const [foodResult, waterResult, workoutResult, recoveryResult, nutritionTargets, activitySummary, healthSyncSummary] = await Promise.all([
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
    getDailyHealthActivity(userId).catch(() => null),
    getHealthSyncSummary(userId).catch(() => null)
  ]);

  const healthMovement = resolveTodayMovementFacts(activitySummary, healthSyncSummary);

  const latestWorkoutAt = workoutResult.rows[0]?.latest_at
    ? new Date(workoutResult.rows[0].latest_at).getTime()
    : null;
  const latestSyncedWorkoutAt = healthMovement.latestWorkoutAt
    ? new Date(healthMovement.latestWorkoutAt).getTime()
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
      workoutCompletedToday: Boolean(workoutResult.rows[0]?.completed_today) || healthMovement.workoutCompletedToday,
      daysSinceWorkout: latestMovementAt === null
        ? null
        : localCalendarDaysSince(latestMovementAt, timezoneOffsetMinutes, nowMs),
      stepsToday: healthMovement.stepsToday,
      stepsAvailable: healthMovement.stepsAvailable,
      activeCaloriesToday: healthMovement.activeCaloriesToday,
      sleepQuality: recoveryResult.rows[0]?.sleep_quality ?? null
    }
  };
}
