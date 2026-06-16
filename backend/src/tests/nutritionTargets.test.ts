import { describe, expect, it } from "vitest";
import { calculateNutritionTargets } from "@ascend/shared";

describe("nutrition targets", () => {
  it("creates a lower calorie guide for fat loss", () => {
    const target = calculateNutritionTargets({
      goalType: "fat_loss",
      sex: "male",
      ageYears: 35,
      heightCm: 175,
      weightKg: 90,
      activityLevel: "moderate"
    });

    expect(target.calorieTarget).toBeGreaterThanOrEqual(1200);
    expect(target.proteinTargetG).toBeGreaterThanOrEqual(150);
    expect(target.carbsTargetG).toBeGreaterThanOrEqual(80);
    expect(target.fatTargetG).toBeGreaterThanOrEqual(40);
    expect(target.explanation).toContain("deficit");
    expect(target.estimated).toBe(false);
  });

  it("creates a higher protein guide for muscle gain", () => {
    const target = calculateNutritionTargets({
      goalType: "muscle_gain",
      sex: "female",
      ageYears: 28,
      heightCm: 162,
      weightKg: 60,
      activityLevel: "high"
    });

    expect(target.calorieTarget).toBeGreaterThan(1800);
    expect(target.proteinTargetG).toBeGreaterThanOrEqual(105);
    expect(target.carbsTargetG).toBeGreaterThan(target.fatTargetG);
    expect(target.explanation).toContain("surplus");
  });

  it("uses safe defaults when profile details are missing", () => {
    const target = calculateNutritionTargets({ goalType: "maintenance" });

    expect(target.calorieTarget).toBeGreaterThanOrEqual(1200);
    expect(target.proteinTargetG).toBeGreaterThanOrEqual(70);
    expect(target.carbsTargetG).toBeGreaterThanOrEqual(80);
    expect(target.fatTargetG).toBeGreaterThanOrEqual(40);
    expect(target.estimated).toBe(true);
  });
});
