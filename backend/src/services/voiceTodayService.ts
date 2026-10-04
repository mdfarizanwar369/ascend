import { z } from "zod";
import { query } from "../db/pool";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { buildTodayPriorityDayContext } from "./todayPriorityContextService";

export const voiceTodayQuery = z.object({
  intent: z.enum([
    "calories_consumed", "calories_remaining", "protein_remaining", "water_logged", "today_summary",
    "water_status", "protein_status", "calories_target", "protein_logged", "protein_target",
    "water_remaining", "water_target", "carbs_logged", "carbs_remaining", "carbs_target",
    "fat_logged", "fat_remaining", "fat_target", "macros_status", "meals_count"
  ]),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840)
});

export type VoiceTodayIntent = z.infer<typeof voiceTodayQuery>["intent"];

export function formatVoiceTodayAnswer(
  intent: VoiceTodayIntent,
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number; waterMl: number; meals: number },
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number; waterMl: number }
) {
  const caloriesRemaining = Math.round(targets.calories - totals.calories);
  const proteinRemaining = Math.round(targets.proteinG - totals.proteinG);
  const waterRemaining = Math.round(targets.waterMl - totals.waterMl);
  const carbsRemaining = Math.round(targets.carbsG - totals.carbsG);
  const fatRemaining = Math.round(targets.fatG - totals.fatG);
  const calorieBalance = caloriesRemaining >= 0
    ? `You have ${caloriesRemaining} calories left in today's guide.`
    : `You're ${Math.abs(caloriesRemaining)} calories above today's guide.`;
  const proteinBalance = proteinRemaining >= 0
    ? `You have ${proteinRemaining} grams of protein left today.`
    : `You're ${Math.abs(proteinRemaining)} grams above today's protein guide.`;
  const waterBalance = waterRemaining >= 0
    ? `You have ${waterRemaining} millilitres left to reach today's water guide.`
    : `You're ${Math.abs(waterRemaining)} millilitres above today's water guide.`;

  switch (intent) {
    case "calories_consumed": return `You've logged ${totals.calories} calories today.`;
    case "calories_remaining": return calorieBalance;
    case "calories_target": return `Your calorie guide today is ${targets.calories} calories.`;
    case "protein_logged": return `You've logged ${totals.proteinG} grams of protein today.`;
    case "protein_remaining": return proteinBalance;
    case "protein_target": return `Your protein guide today is ${targets.proteinG} grams.`;
    case "water_logged": return `You've logged ${totals.waterMl} millilitres of water today.`;
    case "water_remaining": return waterBalance;
    case "water_target": return `Your water guide today is ${targets.waterMl} millilitres.`;
    case "water_status": return `You've logged ${totals.waterMl} millilitres of water today. ${waterBalance}`;
    case "protein_status": return `You've logged ${totals.proteinG} grams of protein today. ${proteinBalance}`;
    case "carbs_logged": return `You've logged ${totals.carbsG} grams of carbs today.`;
    case "carbs_remaining": return carbsRemaining >= 0
      ? `You have ${carbsRemaining} grams of carbs left in today's guide.`
      : `You're ${Math.abs(carbsRemaining)} grams above today's carb guide.`;
    case "carbs_target": return `Your carb guide today is ${targets.carbsG} grams.`;
    case "fat_logged": return `You've logged ${totals.fatG} grams of fat today.`;
    case "fat_remaining": return fatRemaining >= 0
      ? `You have ${fatRemaining} grams of fat left in today's guide.`
      : `You're ${Math.abs(fatRemaining)} grams above today's fat guide.`;
    case "fat_target": return `Your fat guide today is ${targets.fatG} grams.`;
    case "macros_status": return `Today you've logged ${totals.proteinG} grams of protein, ${totals.carbsG} grams of carbs, and ${totals.fatG} grams of fat.`;
    case "meals_count": return `You've logged ${totals.meals} ${totals.meals === 1 ? "meal" : "meals"} today.`;
    case "today_summary": return `Today you've logged ${totals.calories} calories, ${totals.proteinG} grams of protein, and ${totals.waterMl} millilitres of water. ${calorieBalance}`;
  }
}

export async function getVoiceTodayData(userId: string, input: z.infer<typeof voiceTodayQuery>) {
  const { dayStartUtc, dayEndUtc } = buildTodayPriorityDayContext(input.timezoneOffsetMinutes);
  const range = [userId, dayStartUtc.toISOString(), dayEndUtc.toISOString()];
  const [food, water, targets] = await Promise.all([
    query<{ calories: number | string; protein_g: number | string; carbs_g: number | string; fat_g: number | string; meals: number }>(
      `select coalesce(sum(calories), 0) as calories, coalesce(sum(protein_g), 0) as protein_g,
        coalesce(sum(carbs_g), 0) as carbs_g, coalesce(sum(fat_g), 0) as fat_g, count(*)::int as meals
       from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3`, range),
    query<{ water_ml: number | string }>(
      `select coalesce(sum(amount_ml), 0) as water_ml from water_logs
       where user_id = $1 and logged_at >= $2 and logged_at < $3`, range),
    resolveNutritionTargets(userId)
  ]);
  const totals = {
    calories: Math.round(Number(food.rows[0]?.calories ?? 0)),
    proteinG: Math.round(Number(food.rows[0]?.protein_g ?? 0)),
    carbsG: Math.round(Number(food.rows[0]?.carbs_g ?? 0)),
    fatG: Math.round(Number(food.rows[0]?.fat_g ?? 0)),
    waterMl: Math.round(Number(water.rows[0]?.water_ml ?? 0)),
    meals: food.rows[0]?.meals ?? 0
  };
  const guides = { calories: targets.calories, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG, waterMl: targets.waterMl };
  return { intent: input.intent, spokenText: formatVoiceTodayAnswer(input.intent, totals, guides), totals, targets: guides };
}
