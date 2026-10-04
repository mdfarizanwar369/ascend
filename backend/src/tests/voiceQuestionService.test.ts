import { describe, expect, it, vi } from "vitest";
vi.mock("../db/pool", () => ({ query: vi.fn() }));
vi.mock("../services/nutritionTargetService", () => ({ resolveNutritionTargets: vi.fn() }));
vi.mock("../services/healthSyncService", () => ({ getHealthSyncSummary: vi.fn() }));
vi.mock("../services/iosDailyWorkoutService", () => ({ getIosDailyWorkout: vi.fn() }));
import { resolveVoiceQuestion, voiceQuestionQuery } from "../services/voiceQuestionService";

describe("Siri question variations", () => {
  it.each([
    ["How many calories do I have left?", "calories_remaining"],
    ["Can I eat more calories now?", "calories_remaining"],
    ["How many calories can I have for dinner?", "calories_remaining"],
    ["How much can I eat today?", "calories_remaining"],
    ["Can I have more food today?", "calories_remaining"],
    ["What is my calorie budget?", "calories_target"],
    ["What is my calorie guide for today?", "calories_target"],
    ["How many calories have I eaten so far?", "calories_consumed"],
    ["What is my calorie intake so far?", "calories_consumed"],
    ["How much water have I drunk?", "water_logged"],
    ["Can you check how much water I drank?", "water_logged"],
    ["How much more water do I need to drink?", "water_remaining"],
    ["How much more water do I need today?", "water_remaining"],
    ["How much water should I still drink today?", "water_remaining"],
    ["Do I have water left to drink today?", "water_remaining"],
    ["What is my water goal?", "water_target"],
    ["How much water should I drink per day?", "water_target"],
    ["Have I logged any water today?", "water_logged_any"],
    ["Did I drink any water today?", "water_logged_any"],
    ["How much protein is left?", "protein_remaining"],
    ["How much protein did I have?", "protein_logged"],
    ["What is my protein goal?", "protein_target"],
    ["What's my carb target?", "carbs_target"],
    ["How many carbs do I have left?", "carbs_remaining"],
    ["How much fat have I logged?", "fat_logged"],
    ["How much fat can I still have?", "fat_remaining"],
    ["How are my macros?", "macros_status"],
    ["What are my macronutrients so far?", "macros_status"],
    ["How many meals did I log?", "meals_count"],
    ["Have I logged any food today?", "food_logged"],
    ["Did I log any food today?", "food_logged"],
    ["Have I eaten anything today?", "food_logged"],
    ["Have I recorded a meal today?", "food_logged"],
    ["What did I eat for my latest meal?", "latest_meal"],
    ["What did I eat today?", "meals_today"],
    ["Which foods have I logged today?", "meals_today"],
    ["What is my workout for today?", "workout_plan"],
    ["Which exercises are in my workout?", "workout_exercises"],
    ["Did I complete my workout?", "workout_completed"],
    ["Have I logged any workout today?", "workout_logged"],
    ["Did I log a workout today?", "workout_logged"],
    ["Have I worked out today?", "workout_logged"],
    ["Have I done any exercise today?", "workout_logged"],
    ["How many workouts this week?", "workout_count"],
    ["How many workouts have I done today?", "workout_count_today"],
    ["How many calories have I burned in workouts today?", "workout_calories_burned"],
    ["What is my current weight?", "latest_weight"],
    ["What is my target weight?", "weight_goal"],
    ["How much weight have I lost?", "weight_change"],
    ["How much has my weight changed?", "weight_change"],
    ["How did I sleep?", "sleep_quality"],
    ["How many steps today?", "steps_today"],
    ["How many active calories did I burn?", "active_calories"],
    ["How many calories did I burn?", "active_calories"],
    ["How many calories did I burn in my workout?", "workout_calories_burned"],
    ["What is my fat loss goal?", "fitness_goal"],
    ["What is my calorie deficit?", "unsupported"],
    ["What's my subscription?", "subscription"],
    ["How am I doing today?", "today_summary"],
    ["How many calories yesterday?", "unsupported_period"],
    ["What is the weather?", "unsupported"]
  ])("maps %s to %s", (question, expected) => {
    expect(resolveVoiceQuestion(question)).toBe(expected);
  });

  it("bounds free-form input before querying private data", () => {
    expect(voiceQuestionQuery.parse({ question: "How much water?", timezoneOffsetMinutes: "-480" }).timezoneOffsetMinutes).toBe(-480);
    expect(() => voiceQuestionQuery.parse({ question: "x".repeat(251), timezoneOffsetMinutes: 0 })).toThrow();
    expect(() => voiceQuestionQuery.parse({ question: "What is my weight?", timezoneOffsetMinutes: 900 })).toThrow();
  });
});
