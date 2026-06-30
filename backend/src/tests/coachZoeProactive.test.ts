import { describe, expect, it } from "vitest";
import { buildCoachZoeProactiveInsight } from "@ascend/shared";

describe("Coach Zoe proactive insight", () => {
  it("prioritizes completed workouts on the same day", () => {
    const insight = buildCoachZoeProactiveInsight({
      currentStreak: 6,
      todaysFoodCount: 2,
      caloriesToday: 900,
      calorieTarget: 1800,
      proteinTodayG: 55,
      proteinTargetG: 130,
      waterTodayMl: 1200,
      waterTargetMl: 2500,
      workoutDays7: 3,
      daysSinceWorkout: 0,
      latestWorkout: {
        title: "Outdoor Mobility Flow",
        type: "Mobility",
        completedToday: true
      }
    });

    expect(insight.key).toBe("workout_completed");
    expect(insight.body).toContain("Outdoor Mobility Flow");
  });

  it("spots a repeated protein gap", () => {
    const insight = buildCoachZoeProactiveInsight({
      currentStreak: 3,
      todaysFoodCount: 2,
      caloriesToday: 1400,
      calorieTarget: 1800,
      proteinTodayG: 45,
      proteinTargetG: 130,
      waterTodayMl: 1400,
      waterTargetMl: 2500,
      workoutDays7: 1,
      daysSinceWorkout: 1,
      lowProteinDays3: 2,
      highCaloriesDays3: 0,
      lowCaloriesDays3: 0
    });

    expect(insight.key).toBe("protein_low");
    expect(insight.href).toBe("/food-log");
  });

  it("falls back to a calm steady message when nothing meaningful happened", () => {
    const insight = buildCoachZoeProactiveInsight({
      currentStreak: 1,
      todaysFoodCount: 0,
      caloriesToday: 0,
      calorieTarget: 1800,
      proteinTodayG: 0,
      proteinTargetG: 130,
      waterTodayMl: 0,
      waterTargetMl: 2500,
      workoutDays7: 0,
      daysSinceWorkout: null
    });

    expect(insight.key).toBe("steady");
    expect(insight.body).toBe("Keep building consistency.");
  });
});
