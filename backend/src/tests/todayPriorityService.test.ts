import { describe, expect, it } from "vitest";
import { buildTodayPriorityCandidates, deterministicTodayPriority } from "../services/todayPriorityService";

describe("Today priority candidates", () => {
  it("prefers movement over remaining water in the afternoon when meals are logged", () => {
    const priority = deterministicTodayPriority({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 70,
      proteinTargetG: 125,
      waterTodayMl: 1500,
      waterTargetMl: 2500,
      workoutCompletedToday: false,
      daysSinceWorkout: null,
      weightLoggedToday: false,
      weightLogs7d: 0,
      activeHabits: 0,
      habitsCompletedToday: 0
    });

    expect(priority.key).toBe("Movement");
    expect(priority.reason).toContain("basics are already underway");
  });

  it("prioritizes a missing meal later in the day", () => {
    const priority = deterministicTodayPriority({
      localHour: 14,
      mealsToday: 0,
      proteinTodayG: 0,
      proteinTargetG: 125,
      waterTodayMl: 1500,
      waterTargetMl: 2500,
      workoutCompletedToday: false,
      daysSinceWorkout: 1,
      weightLoggedToday: false,
      weightLogs7d: 1,
      activeHabits: 0,
      habitsCompletedToday: 0
    });

    expect(priority.key).toBe("Meal");
  });

  it("keeps hydration as a candidate without forcing it to the top", () => {
    const candidates = buildTodayPriorityCandidates({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 100,
      proteinTargetG: 125,
      waterTodayMl: 1500,
      waterTargetMl: 2500,
      workoutCompletedToday: false,
      daysSinceWorkout: 3,
      weightLoggedToday: true,
      weightLogs7d: 2,
      activeHabits: 0,
      habitsCompletedToday: 0
    });

    expect(candidates.map((candidate) => candidate.key)).toEqual(["Movement", "Water"]);
    expect(candidates[1].reason).toContain("does not need to be finished all at once");
  });
});
