import { query } from "../db/pool";
import { localDateKey } from "./athleteService";

export type TrainerInsightWindow = 7 | 30;
export type SleepQuality = "poor" | "okay" | "good";

export type TrainerInsightDay = {
  date: string;
  foodEntries: number;
  loggedCalories: number | null;
  loggedProteinG: number | null;
  recordedWorkouts: number;
  sleepQuality: SleepQuality | null;
  sleepHours: number | null;
};

export type TrainerClientInsights = {
  windowDays: TrainerInsightWindow;
  timeZone: string;
  days: TrainerInsightDay[];
  summary: {
    foodLoggedDays: number;
    foodEntries: number;
    recordedWorkouts: number;
    recoveryCheckinDays: number;
    sleepHoursDays: number;
  };
};

type FoodDayRow = { day: string; entries: number | string; calories: number | string; protein_g: number | string };
type WorkoutDayRow = { day: string; workouts: number | string };
type RecoveryDayRow = { day: string; sleep_quality: SleepQuality };
type AthleteDayRow = { day: string; sleep_hours: number | string };

function validTimeZone(value: string | null | undefined) {
  const candidate = value || "Asia/Kuala_Lumpur";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate });
    return candidate;
  } catch {
    return "Asia/Kuala_Lumpur";
  }
}

export function buildTrainerClientInsights(input: {
  windowDays: TrainerInsightWindow;
  timeZone: string;
  now?: Date;
  food: FoodDayRow[];
  workouts: WorkoutDayRow[];
  recovery: RecoveryDayRow[];
  athlete: AthleteDayRow[];
}): TrainerClientInsights {
  const today = localDateKey(input.now ?? new Date(), input.timeZone);
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  const foodByDay = new Map(input.food.map((row) => [row.day, row]));
  const workoutByDay = new Map(input.workouts.map((row) => [row.day, row]));
  const recoveryByDay = new Map(input.recovery.map((row) => [row.day, row]));
  const athleteByDay = new Map(input.athlete.map((row) => [row.day, row]));

  const days = Array.from({ length: input.windowDays }, (_, index): TrainerInsightDay => {
    const date = new Date(todayUtc - (input.windowDays - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    const food = foodByDay.get(date);
    const entries = Number(food?.entries ?? 0);
    return {
      date,
      foodEntries: entries,
      loggedCalories: entries ? Number(food?.calories ?? 0) : null,
      loggedProteinG: entries ? Number(food?.protein_g ?? 0) : null,
      recordedWorkouts: Number(workoutByDay.get(date)?.workouts ?? 0),
      sleepQuality: recoveryByDay.get(date)?.sleep_quality ?? null,
      sleepHours: athleteByDay.has(date) ? Number(athleteByDay.get(date)?.sleep_hours) : null
    };
  });

  return {
    windowDays: input.windowDays,
    timeZone: input.timeZone,
    days,
    summary: {
      foodLoggedDays: days.filter((day) => day.foodEntries > 0).length,
      foodEntries: days.reduce((sum, day) => sum + day.foodEntries, 0),
      recordedWorkouts: days.reduce((sum, day) => sum + day.recordedWorkouts, 0),
      recoveryCheckinDays: days.filter((day) => day.sleepQuality !== null || day.sleepHours !== null).length,
      sleepHoursDays: days.filter((day) => day.sleepHours !== null).length
    }
  };
}

export async function getTrainerClientInsights(clientId: string, windowDays: TrainerInsightWindow) {
  const profile = await query<{ time_zone: string | null; athlete_mode_enabled: boolean }>(`
    select coalesce(ap.timezone, g.timezone, 'Asia/Kuala_Lumpur') as time_zone,
      coalesce(ap.enabled, false) as athlete_mode_enabled
    from users u
    left join gyms g on g.id = u.gym_id
    left join athlete_profiles ap on ap.user_id = u.id and ap.enabled = true
    where u.id = $1
  `, [clientId]);
  const timeZone = validTimeZone(profile.rows[0]?.time_zone);
  const localToday = localDateKey(new Date(), timeZone);
  const earliestDate = new Date(Date.parse(`${localToday}T00:00:00Z`) - (windowDays - 1) * 86_400_000).toISOString().slice(0, 10);

  const [food, workouts, recovery, athlete] = await Promise.all([
    query<FoodDayRow>(`
      select (logged_at at time zone $2)::date::text as day,
        count(*)::int as entries, sum(calories)::float as calories, sum(protein_g)::float as protein_g
      from food_logs
      where user_id = $1 and logged_at >= ($3::date::timestamp at time zone $2)
      group by 1
    `, [clientId, timeZone, earliestDate]),
    query<WorkoutDayRow>(`
      select (created_at at time zone $2)::date::text as day, count(*)::int as workouts
      from analytics_events
      where user_id = $1 and event_name = 'burn_log'
        and created_at >= ($3::date::timestamp at time zone $2)
      group by 1
    `, [clientId, timeZone, earliestDate]),
    query<RecoveryDayRow>(`
      select checkin_date::text as day, sleep_quality
      from recovery_checkins
      where user_id = $1 and checkin_date >= $2::date
    `, [clientId, earliestDate]),
    profile.rows[0]?.athlete_mode_enabled
      ? query<AthleteDayRow>(`
          select checkin_date::text as day, sleep_hours::float as sleep_hours
          from athlete_readiness_checkins
          where user_id = $1 and checkin_date >= $2::date
        `, [clientId, earliestDate])
      : Promise.resolve({ rows: [] as AthleteDayRow[] })
  ]);

  return buildTrainerClientInsights({
    windowDays,
    timeZone,
    food: food.rows,
    workouts: workouts.rows,
    recovery: recovery.rows,
    athlete: athlete.rows
  });
}
