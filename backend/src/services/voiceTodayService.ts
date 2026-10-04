import { z } from "zod";
import { query } from "../db/pool";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { buildTodayPriorityDayContext } from "./todayPriorityContextService";

export const voiceTodayQuery = z.object({
  intent: z.enum([
    "calories_consumed", "calories_remaining", "protein_remaining", "water_logged", "today_summary",
    "water_status", "protein_status"
  ]),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840)
});

export type VoiceTodayIntent = z.infer<typeof voiceTodayQuery>["intent"];

export function formatVoiceTodayAnswer(
  intent: VoiceTodayIntent,
  totals: { calories: number; proteinG: number; waterMl: number; meals: number },
  targets: { calories: number; proteinG: number; waterMl: number }
) {
  const caloriesRemaining = Math.round(targets.calories - totals.calories);
  const proteinRemaining = Math.round(targets.proteinG - totals.proteinG);
  const waterRemaining = Math.round(targets.waterMl - totals.waterMl);
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
    case "protein_remaining": return proteinBalance;
    case "water_logged": return `You've logged ${totals.waterMl} millilitres of water today.`;
    case "water_status": return `You've logged ${totals.waterMl} millilitres of water today. ${waterBalance}`;
    case "protein_status": return `You've logged ${totals.proteinG} grams of protein today. ${proteinBalance}`;
    case "today_summary": return `Today you've logged ${totals.calories} calories, ${totals.proteinG} grams of protein, and ${totals.waterMl} millilitres of water. ${calorieBalance}`;
  }
}

export async function getVoiceTodayData(userId: string, input: z.infer<typeof voiceTodayQuery>) {
  const { dayStartUtc, dayEndUtc } = buildTodayPriorityDayContext(input.timezoneOffsetMinutes);
  const range = [userId, dayStartUtc.toISOString(), dayEndUtc.toISOString()];
  const [food, water, targets] = await Promise.all([
    query<{ calories: number | string; protein_g: number | string; meals: number }>(
      `select coalesce(sum(calories), 0) as calories, coalesce(sum(protein_g), 0) as protein_g, count(*)::int as meals
       from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3`, range),
    query<{ water_ml: number | string }>(
      `select coalesce(sum(amount_ml), 0) as water_ml from water_logs
       where user_id = $1 and logged_at >= $2 and logged_at < $3`, range),
    resolveNutritionTargets(userId)
  ]);
  const totals = {
    calories: Math.round(Number(food.rows[0]?.calories ?? 0)),
    proteinG: Math.round(Number(food.rows[0]?.protein_g ?? 0)),
    waterMl: Math.round(Number(water.rows[0]?.water_ml ?? 0)),
    meals: food.rows[0]?.meals ?? 0
  };
  const guides = { calories: targets.calories, proteinG: targets.proteinG, waterMl: targets.waterMl };
  return { intent: input.intent, spokenText: formatVoiceTodayAnswer(input.intent, totals, guides), totals, targets: guides };
}
