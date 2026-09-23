import { randomUUID } from "crypto";
import { pool, query, withQueryClient } from "../db/pool";
import type { CoachWorkoutPlan } from "../integrations/openai";
import { localDayStartUtc } from "./memberTimeService";
import { env } from "../config/env";

export type DailyWorkoutRequest = {
  location: "gym" | "home" | "hotel" | "outdoors";
  timeAvailable: "20" | "30" | "45" | "60";
  goal: "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "recovery" | "mobility";
  equipment: string;
};
type StoredWorkout = {
  completion_key: string;
  request: DailyWorkoutRequest;
  workout: CoachWorkoutPlan;
  resets_at: Date | string;
  completed?: boolean;
};
function toDailyWorkout(row: StoredWorkout) {
  return {
    workoutCompletionKey: row.completion_key,
    request: row.request,
    workout: row.workout,
    resetsAt: new Date(row.resets_at).toISOString(),
    completed: row.completed === true
  };
}
const selectWorkout = `select w.*, exists (
  select 1 from analytics_events e where e.user_id = w.user_id
    and e.event_name = 'burn_log' and e.metadata->>'workoutCompletionKey' = w.completion_key::text
) as completed from ios_daily_workouts w`;

export async function getIosDailyWorkout(userId: string, now = new Date()) {
  const result = await query<StoredWorkout>(`${selectWorkout}
    where w.user_id = $1 and w.resets_at > $2 order by w.created_at desc limit 1`, [userId, now.toISOString()]);
  return result.rows[0] ? toDailyWorkout(result.rows[0]) : null;
}

export async function getIosWorkoutForCompletion(userId: string, completionKey: string) {
  const result = await query<StoredWorkout>(`${selectWorkout}
    where w.user_id = $1 and w.completion_key = $2`, [userId, completionKey]);
  return result.rows[0] ? toDailyWorkout(result.rows[0]) : null;
}

// A database lock protects the allowance across devices and API instances.
// The plan and usage record commit together only after successful generation.
export async function generateIosDailyWorkout(input: {
  userId: string;
  gymId?: string | null;
  request: DailyWorkoutRequest;
  timezoneOffsetMinutes: number;
  generate: () => Promise<CoachWorkoutPlan>;
}, now = new Date()) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const lock = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked", [`ios-daily-workout:${input.userId}`]);
    if (!lock.rows[0]?.locked) {
      throw Object.assign(new Error("Zoe is already preparing your workout. Try opening it again in a moment."), { status: 409 });
    }
    // Use the stored reset time so changing device time zones cannot unlock a second plan.
    const existing = await client.query<StoredWorkout>(`${selectWorkout}
      where w.user_id = $1 and w.resets_at > $2 order by w.created_at desc limit 1`, [input.userId, now.toISOString()]);
    if (existing.rows[0]) {
      await client.query("commit");
      return toDailyWorkout(existing.rows[0]);
    }
    const workout = await withQueryClient(client, input.generate);
    const resetsAt = new Date(localDayStartUtc(input.timezoneOffsetMinutes, now).getTime() + 86_400_000).toISOString();
    const completionKey = randomUUID();
    await client.query(`insert into ios_daily_workouts
      (completion_key, user_id, request, workout, created_at, resets_at) values ($1,$2,$3,$4,$5,$6)`,
    [completionKey, input.userId, input.request, workout, now.toISOString(), resetsAt]);
    await client.query(`insert into ai_usage_events
      (user_id, gym_id, event_type, provider, model, status, estimated_cost_cents, metadata)
      values ($1,$2,'ai_chat_message',$3,$4,'success',$5,$6)`,
    [input.userId, input.gymId ?? null, env.AI_PROVIDER, env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      env.AI_CHAT_ESTIMATED_COST_CENTS, { feature: "coach_zoe_workout_planner", mode: "workout", coachTier: "free", edition: "ios" }]);
    await client.query("commit");
    return toDailyWorkout({ completion_key: completionKey, request: input.request, workout, resets_at: resetsAt });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
