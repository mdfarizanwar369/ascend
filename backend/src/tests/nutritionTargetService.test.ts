import { describe, expect, it } from "vitest";
import { calculateNutritionTargets } from "@ascend/shared";
import { applyNutritionTargetPrecedence, memberNutritionPreferenceSchema } from "../services/nutritionTargetService";

const recommended = calculateNutritionTargets({
  goalType: "fat_loss",
  sex: "male",
  ageYears: 35,
  heightCm: 175,
  weightKg: 85,
  activityLevel: "moderate"
});

const coachPlan = {
  calories: 2100,
  protein_g: 170,
  carbs_g: 205,
  fat_g: 67,
  updated_at: "2026-08-12T00:00:00.000Z"
};

const memberPreference = {
  mode: "custom" as const,
  calories: 2000,
  protein_g: 160,
  carbs_g: 200,
  fat_g: 62,
  updated_at: "2026-08-11T00:00:00.000Z"
};

describe("nutrition target precedence", () => {
  it("keeps an active coach plan authoritative", () => {
    const result = applyNutritionTargetPrecedence({ recommended, coachPlan, memberPreference, bodyScanUsed: true });

    expect(result.source).toBe("coach_plan");
    expect(result.calories).toBe(2100);
    expect(result.editableByMember).toBe(false);
  });

  it("uses a member's custom targets when no coach plan is active", () => {
    const result = applyNutritionTargetPrecedence({ recommended, memberPreference, bodyScanUsed: true });

    expect(result.source).toBe("member_custom");
    expect(result.proteinG).toBe(160);
    expect(result.editableByMember).toBe(true);
  });

  it("uses the Ascend recommendation when the member chooses Ascend mode", () => {
    const result = applyNutritionTargetPrecedence({
      recommended,
      memberPreference: { ...memberPreference, mode: "ascend" },
      bodyScanUsed: true
    });

    expect(result.source).toBe("body_scan");
    expect(result.calories).toBe(recommended.calorieTarget);
  });

  it("rejects custom macros that do not reasonably match calories", () => {
    const result = memberNutritionPreferenceSchema.safeParse({
      mode: "custom",
      calories: 1200,
      proteinG: 300,
      carbsG: 500,
      fatG: 200
    });

    expect(result.success).toBe(false);
  });
});
