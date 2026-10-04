import { z } from "zod";
import { query } from "../db/pool";
import { getHealthSyncSummary } from "./healthSyncService";
import { getIosDailyWorkout } from "./iosDailyWorkoutService";
import { buildTodayPriorityDayContext } from "./todayPriorityContextService";
import { getVoiceTodayData, type VoiceTodayIntent } from "./voiceTodayService";

export const voiceQuestionQuery = z.object({
  question: z.string().trim().min(3).max(250),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840)
});

type OtherIntent = "workout_plan" | "workout_exercises" | "workout_completed" | "workout_count" | "workout_count_today" | "latest_weight" |
  "weight_goal" | "weight_change" | "fitness_goal" | "sleep_quality" | "steps_today" |
  "active_calories" | "latest_meal" | "meals_today" | "subscription" | "unsupported_period";
export type VoiceQuestionIntent = VoiceTodayIntent | OtherIntent | "unsupported";

const includes = (text: string, pattern: RegExp) => pattern.test(text);

export function resolveVoiceQuestion(question: string): VoiceQuestionIntent {
  const text = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (includes(text, /\b(yesterday|tomorrow|last week|last month|previous week|previous month)\b/)) return "unsupported_period";
  if (includes(text, /\b(calorie deficit|calories deficit|deficit)\b/)) return "unsupported";
  if (includes(text, /\b(subscription|membership|billing|paid plan)\b/)) return "subscription";
  if (includes(text, /\b(steps?|walking distance)\b/)) return "steps_today";
  if (includes(text, /\b(sleep|slept|recovery check)\b/)) return "sleep_quality";
  if (includes(text, /\b(active calories|calories burned|burned calories|energy burned)\b/) ||
      (includes(text, /\b(burn|burned)\b/) && includes(text, /\b(calories|energy)\b/))) return "active_calories";
  if (includes(text, /\b(workouts?|exercise|training|gym session)\b/)) {
    if (includes(text, /\b(how many|number|count|this week)\b/)) return includes(text, /\b(today|so far)\b/) ? "workout_count_today" : "workout_count";
    if (includes(text, /\b(done|did i|completed|finished|already)\b/)) return "workout_completed";
    if (includes(text, /\b(which|list|names?|what exercises|what moves|what movements)\b/)) return "workout_exercises";
    return "workout_plan";
  }
  if (includes(text, /\b(weight|weigh)\b/)) {
    if (includes(text, /\b(goal|target|aim|want to)\b/)) return "weight_goal";
    if (includes(text, /\b(change|changed|progress|lost|gained|difference|since start)\b/)) return "weight_change";
    return "latest_weight";
  }
  if (includes(text, /\b(fat loss|muscle gain|general fitness|maintenance)\b/) && includes(text, /\b(goal|focus|objective)\b/)) return "fitness_goal";
  if (includes(text, /\b(goal|focus|objective)\b/) && !includes(text, /\b(calorie|protein|carb|fat|water)\b/)) return "fitness_goal";
  if (includes(text, /\b(last|latest|recent)\b/) && includes(text, /\b(meal|food|ate|eat)\b/)) return "latest_meal";
  if (includes(text, /\b(how many|number|count)\b/) && includes(text, /\b(meals?|foods?)\b/)) return "meals_count";
  if (includes(text, /\b(what|which|list)\b/) && includes(text, /\b(ate|eaten|eat|meals?|foods?)\b/)) return "meals_today";
  if (includes(text, /\b(water|hydration|hydrated|drink|drank|drunk)\b/)) {
    if (includes(text, /\b(goal|target|aim|should|need per day)\b/)) return "water_target";
    if (includes(text, /\b(left|remaining|more|need to drink|still need)\b/)) return "water_remaining";
    if (includes(text, /\b(how much|logged|had|consumed|drank|drunk|intake)\b/)) return "water_logged";
    return "water_status";
  }
  if (includes(text, /\b(macros?|macronutrients?)\b/)) return "macros_status";
  const target = includes(text, /\b(goal|target|budget|guide|aim|supposed to|should i have)\b/);
  const remaining = includes(text, /\b(left|remaining|more|spare|available|can i eat|can i have|could i eat|could i have|still have|need to eat|need)\b/);
  const logged = includes(text, /\b(logged|eaten|ate|had|consumed|intake|so far|did i have)\b/);
  if (includes(text, /\b(protein)\b/)) return target ? "protein_target" : remaining ? "protein_remaining" : logged ? "protein_logged" : "protein_status";
  if (includes(text, /\b(carbs?|carbohydrates?)\b/)) return target ? "carbs_target" : remaining ? "carbs_remaining" : "carbs_logged";
  if (includes(text, /\b(fat|fats)\b/)) return target ? "fat_target" : remaining ? "fat_remaining" : "fat_logged";
  if (includes(text, /\b(calories|calorie|kilocalories|kcal|energy|food budget)\b/)) {
    return target ? "calories_target" : remaining ? "calories_remaining" : logged ? "calories_consumed" : "calories_remaining";
  }
  if (includes(text, /\b(summary|overview|how am i doing|today so far|my day|daily update|nutrition today|my progress)\b/)) return "today_summary";
  return "unsupported";
}

const unsupportedAnswer = "I can check today's food, water, macros, workouts, weight, goal, sleep check-in, steps if synced, and membership. Try asking about one of those.";

export async function getVoiceQuestionData(userId: string, input: z.infer<typeof voiceQuestionQuery>) {
  const intent = resolveVoiceQuestion(input.question);
  const { dayStartUtc, dayEndUtc, localDate } = buildTodayPriorityDayContext(input.timezoneOffsetMinutes);
  const dayRange = [userId, dayStartUtc.toISOString(), dayEndUtc.toISOString()];
  let spokenText: string;
  if (intent === "unsupported") spokenText = unsupportedAnswer;
  else if (intent === "unsupported_period") spokenText = "I can answer today's numbers right now. Open Ascend to review earlier days.";
  else if (intent === "workout_plan" || intent === "workout_exercises") {
    const plan = await getIosDailyWorkout(userId);
    spokenText = !plan ? "You haven't generated a Zoe workout for today. Open Ascend to make one."
      : intent === "workout_exercises"
        ? `Today's Zoe workout includes ${plan.workout.exercises.map(exercise => exercise.name).join(", ")}.`
        : `Today's Zoe workout is ${plan.workout.title}, about ${plan.workout.estimatedDurationMinutes} minutes, with ${plan.workout.exercises.length} exercises.${plan.completed ? " You've completed it." : ""}`;
  } else if (intent === "workout_completed" || intent === "workout_count" || intent === "workout_count_today") {
    const start = intent === "workout_count" ? new Date(dayStartUtc.getTime() - 6 * 86_400_000) : dayStartUtc;
    const result = await query<{ count: number }>(
      `select count(*)::int as count from analytics_events
       where user_id = $1 and event_name = 'burn_log' and created_at >= $2 and created_at < $3`,
      [userId, start.toISOString(), dayEndUtc.toISOString()]
    );
    const count = result.rows[0]?.count ?? 0;
    spokenText = intent === "workout_count"
      ? `You've logged ${count} ${count === 1 ? "workout" : "workouts"} in the last seven days.`
      : intent === "workout_count_today"
        ? `You've logged ${count} ${count === 1 ? "workout" : "workouts"} today.`
        : count ? "Yes, you've logged a workout today." : "You haven't logged a workout in Ascend today.";
  } else if (intent === "latest_weight" || intent === "weight_goal" || intent === "weight_change" || intent === "fitness_goal") {
    const result = await query<{ goal_type: string | null; starting_weight_kg: string | null; target_weight_kg: string | null; latest_weight_kg: string | null }>(
      `select u.goal_type, u.starting_weight_kg, u.target_weight_kg,
         (select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1) as latest_weight_kg
       from users u where u.id = $1`, [userId]
    );
    const row = result.rows[0];
    const latest = row?.latest_weight_kg;
    if (intent === "fitness_goal") spokenText = row?.goal_type
      ? `Your Ascend goal is ${row.goal_type.replace(/_/g, " ")}.` : "You haven't set a fitness goal in Ascend yet.";
    else if (intent === "weight_goal") spokenText = row?.target_weight_kg
      ? `Your target weight is ${Number(row.target_weight_kg)} kilograms.` : "You haven't set a target weight in Ascend yet.";
    else if (intent === "latest_weight") spokenText = latest
      ? `Your latest logged weight in Ascend is ${Number(latest)} kilograms.`
      : row?.starting_weight_kg ? `Your starting weight is ${Number(row.starting_weight_kg)} kilograms. You haven't logged a new weight yet.`
        : "You haven't logged a weight in Ascend yet.";
    else spokenText = latest && row?.starting_weight_kg
      ? `You're ${Math.abs(Number(latest) - Number(row.starting_weight_kg)).toFixed(1)} kilograms ${Number(latest) <= Number(row.starting_weight_kg) ? "below" : "above"} your starting weight.`
      : "I need a starting weight and a weight log to show your progress.";
  } else if (intent === "sleep_quality") {
    const result = await query<{ sleep_quality: string }>(
      "select sleep_quality from recovery_checkins where user_id = $1 and checkin_date = $2::date limit 1",
      [userId, localDate]
    );
    spokenText = result.rows[0]
      ? `Your sleep quality check-in for today is ${result.rows[0].sleep_quality}.`
      : "You haven't recorded a sleep quality check-in in Ascend today.";
  } else if (intent === "steps_today" || intent === "active_calories") {
    const health = await getHealthSyncSummary(userId).catch(() => null);
    spokenText = !health?.connected
      ? "Ascend isn't syncing activity from this iPhone yet, so I can't give you that number."
      : intent === "steps_today" ? `Ascend has ${health.todaySteps} synced steps today.`
        : `Ascend has ${health.todayActiveCalories} synced active calories today.`;
  } else if (intent === "latest_meal" || intent === "meals_today") {
    const result = await query<{ estimated_food_name: string }>(
      `select estimated_food_name from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3
       order by logged_at desc limit ${intent === "latest_meal" ? 1 : 5}`, dayRange
    );
    spokenText = !result.rows.length ? "You haven't logged a meal in Ascend today."
      : intent === "latest_meal" ? `Your latest meal logged today was ${result.rows[0].estimated_food_name}.`
        : `Today you've logged ${result.rows.map(row => row.estimated_food_name).join(", ")}${result.rows.length === 5 ? ", and possibly more. Open Ascend for the full list." : "."}`;
  } else if (intent === "subscription") {
    const result = await query<{ plan: string; status: string }>(
      "select plan, status from subscriptions where user_id = $1 order by created_at desc limit 1", [userId]
    );
    spokenText = result.rows[0]
      ? `Your Ascend membership is ${result.rows[0].plan.replace(/_/g, " ")}, with ${result.rows[0].status} status.`
      : "I couldn't find an Ascend membership for your account.";
  } else {
    spokenText = (await getVoiceTodayData(userId, { intent, timezoneOffsetMinutes: input.timezoneOffsetMinutes })).spokenText;
  }
  return { intent, spokenText };
}
