import { describe, expect, it } from "vitest";
import { calculateAdaptiveNutritionTargets, calculateNutritionTargets, hasReachedWeightGoal } from "@ascend/shared";

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

  it("uses body composition data when available", () => {
    const target = calculateNutritionTargets({
      goalType: "fat_loss",
      sex: "male",
      ageYears: 35,
      heightCm: 175,
      weightKg: 90,
      activityLevel: "moderate",
      bodyComposition: {
        leanBodyMassKg: 62,
        bodyFatPercent: 31,
        bmrKcal: 1780,
        visceralFat: 15,
        scanCount: 2
      }
    });

    expect(target.dataSourcesUsed).toBe("Profile + Body Scan History");
    expect(target.proteinTargetG).toBeGreaterThanOrEqual(130);
    expect(target.explanation).toContain("body scan data");
    expect(target.explanation).toContain("measured BMR");
  });

  it("adapts only after at least two weeks of weight evidence", () => {
    const profile = { goalType: "fat_loss" as const, sex: "male" as const, ageYears: 35, heightCm: 175, weightKg: 90, activityLevel: "moderate" as const };
    const base = calculateNutritionTargets(profile);
    const adaptive = calculateAdaptiveNutritionTargets(profile, [
      { weightKg: 90, loggedAt: "2026-06-01T08:00:00.000Z" },
      { weightKg: 90, loggedAt: "2026-06-08T08:00:00.000Z" },
      { weightKg: 90, loggedAt: "2026-06-16T08:00:00.000Z" }
    ]);

    expect(adaptive.calorieTarget).toBe(base.calorieTarget - 100);
    expect(adaptive.adaptiveAdjustment).toBe(-100);
    expect(adaptive.adaptationReason).toContain("gently reduced");
  });

  it("does not adapt from short-term fluctuations", () => {
    const profile = { goalType: "muscle_gain" as const, sex: "female" as const, ageYears: 28, heightCm: 162, weightKg: 60, activityLevel: "high" as const };
    const adaptive = calculateAdaptiveNutritionTargets(profile, [
      { weightKg: 60, loggedAt: "2026-06-01T08:00:00.000Z" },
      { weightKg: 60.1, loggedAt: "2026-06-03T08:00:00.000Z" },
      { weightKg: 59.9, loggedAt: "2026-06-05T08:00:00.000Z" }
    ]);

    expect(adaptive.adaptiveAdjustment).toBe(0);
  });

  it("recognizes fat-loss and muscle-gain targets in the correct direction", () => {
    expect(hasReachedWeightGoal("fat_loss", 69.8, 70)).toBe(true);
    expect(hasReachedWeightGoal("fat_loss", 70.2, 70)).toBe(false);
    expect(hasReachedWeightGoal("muscle_gain", 75.1, 75)).toBe(true);
    expect(hasReachedWeightGoal("maintenance", 75, 75)).toBe(false);
  });
});
