import { describe, expect, it, vi } from "vitest";
vi.mock("../db/pool", () => ({ query: vi.fn() }));
vi.mock("../services/nutritionTargetService", () => ({ resolveNutritionTargets: vi.fn() }));
vi.mock("../services/todayPriorityContextService", () => ({ buildTodayPriorityDayContext: vi.fn() }));
import { formatVoiceTodayAnswer, voiceTodayQuery } from "../services/voiceTodayService";

const totals = { calories: 1400, proteinG: 72, carbsG: 130, fatG: 40, waterMl: 1250, meals: 3 };
const targets = { calories: 2000, proteinG: 110, carbsG: 210, fatG: 65, waterMl: 2000 };

describe("Siri's deterministic Today answers", () => {
  it("answers the requested calorie, water, protein, and summary questions from the same totals", () => {
    expect(formatVoiceTodayAnswer("calories_remaining", totals, targets)).toContain("600 calories left");
    expect(formatVoiceTodayAnswer("calories_consumed", totals, targets)).toContain("logged 1400 calories");
    expect(formatVoiceTodayAnswer("water_status", totals, targets)).toContain("1250 millilitres of water today. You have 750 millilitres left");
    expect(formatVoiceTodayAnswer("protein_status", totals, targets)).toContain("72 grams of protein today. You have 38 grams");
    expect(formatVoiceTodayAnswer("today_summary", totals, targets)).toContain("600 calories left");
    expect(formatVoiceTodayAnswer("carbs_remaining", totals, targets)).toContain("80 grams of carbs left");
    expect(formatVoiceTodayAnswer("fat_target", totals, targets)).toContain("65 grams");
    expect(formatVoiceTodayAnswer("meals_count", totals, targets)).toContain("3 meals");
  });

  it("never offers a negative allowance after the guide is exceeded", () => {
    const above = { calories: 2150, proteinG: 120, carbsG: 220, fatG: 70, waterMl: 2300, meals: 4 };
    expect(formatVoiceTodayAnswer("calories_remaining", above, targets)).toContain("150 calories above");
    expect(formatVoiceTodayAnswer("water_status", above, targets)).toContain("300 millilitres above");
    expect(formatVoiceTodayAnswer("protein_status", above, targets)).toContain("10 grams above");
  });

  it("only accepts supported questions and plausible timezone offsets", () => {
    expect(voiceTodayQuery.parse({ intent: "water_status", timezoneOffsetMinutes: "-480" }).timezoneOffsetMinutes).toBe(-480);
    expect(() => voiceTodayQuery.parse({ intent: "coach_anything", timezoneOffsetMinutes: 0 })).toThrow();
    expect(() => voiceTodayQuery.parse({ intent: "water_logged", timezoneOffsetMinutes: 900 })).toThrow();
  });
});
