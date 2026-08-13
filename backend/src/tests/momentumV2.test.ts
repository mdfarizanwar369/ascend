import { describe, expect, it } from "vitest";
import { calculateMomentumV2, MomentumDay } from "../domain/momentumV2";

function day(overrides: Partial<MomentumDay> = {}): MomentumDay {
  return {
    date: "2026-08-13",
    weight: 1,
    meals: 3,
    calories: 1800,
    proteinG: 125,
    waterMl: 2500,
    workouts: 1,
    activeMinutes: 45,
    steps: 8000,
    activeCalories: 350,
    sleepQuality: "good",
    focusAssigned: 0,
    focusCompleted: 0,
    ...overrides
  };
}

describe("Momentum V2", () => {
  it("uses Fuel, Move and Recover without awarding weight points", () => {
    const score = calculateMomentumV2({
      goal: "fat_loss",
      calorieTarget: 1800,
      proteinTargetG: 125,
      waterTargetMl: 2500,
      days: [day()]
    });
    expect(score.score).toBe(100);
    expect(score.focusActive).toBe(false);
    expect(score.fuelScore).toBe(40);
    expect(score.moveScore).toBe(40);
  });

  it("redistributes ten points when no personal focus is active", () => {
    const withoutFocus = calculateMomentumV2({ goal: "maintenance", calorieTarget: 1800, proteinTargetG: 125, waterTargetMl: 2500, days: [day()] });
    const withFocus = calculateMomentumV2({ goal: "maintenance", calorieTarget: 1800, proteinTargetG: 125, waterTargetMl: 2500, days: [day({ focusAssigned: 1, focusCompleted: 1 })] });
    expect(withoutFocus.focusScore).toBeNull();
    expect(withFocus.focusScore).toBe(10);
    expect(withFocus.fuelScore).toBe(35);
    expect(withFocus.moveScore).toBe(35);
  });

  it("keeps missing sleep neutral instead of making full recovery impossible", () => {
    const missingSleep = calculateMomentumV2({ goal: "maintenance", calorieTarget: 1800, proteinTargetG: 125, waterTargetMl: 2500, days: [day({ workouts: 0, sleepQuality: null })] });
    expect(missingSleep.recoverScore).toBeGreaterThanOrEqual(18);
  });

  it("weights recent days more heavily", () => {
    const improving = calculateMomentumV2({
      goal: "fat_loss", calorieTarget: 1800, proteinTargetG: 125, waterTargetMl: 2500,
      days: [day({ date: "2026-08-12", meals: 0, calories: 0, proteinG: 0, waterMl: 0, workouts: 0, steps: 0, activeCalories: 0 }), day()]
    });
    const declining = calculateMomentumV2({
      goal: "fat_loss", calorieTarget: 1800, proteinTargetG: 125, waterTargetMl: 2500,
      days: [day({ date: "2026-08-12" }), day({ meals: 0, calories: 0, proteinG: 0, waterMl: 0, workouts: 0, steps: 0, activeCalories: 0, sleepQuality: "poor" })]
    });
    expect(improving.score).toBeGreaterThan(declining.score);
  });
});
