import { describe, expect, it } from "vitest";
import { buildTodayPriorityCandidates, deterministicTodayPriority, shouldUseAiPriorityRefinement, TodayPriorityFacts } from "../services/todayPriorityService";

function facts(overrides: Partial<TodayPriorityFacts> = {}): TodayPriorityFacts {
  return {
    localHour: 12,
    mealsToday: 1,
    proteinTodayG: 50,
    proteinTargetG: 125,
    waterTodayMl: 1_000,
    waterTargetMl: 2_500,
    workoutCompletedToday: false,
    daysSinceWorkout: 1,
    stepsToday: 0,
    activeCaloriesToday: 0,
    sleepQuality: null,
    ...overrides
  };
}

describe("Today priority candidates", () => {
  it("prefers movement in the user's 4:30pm scenario instead of chasing the final litre", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 70,
      waterTodayMl: 1500,
      daysSinceWorkout: null,
    }));

    expect(priority.key).toBe("Movement");
    expect(priority.reason).toContain("basics are already underway");
  });

  it("prioritizes a missing meal later in the day", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 14,
      mealsToday: 0,
      proteinTodayG: 0,
      waterTodayMl: 1500,
      daysSinceWorkout: 1,
    }));

    expect(priority.key).toBe("Meal");
  });

  it("keeps hydration as a candidate without forcing it to the top", () => {
    const candidates = buildTodayPriorityCandidates(facts({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 100,
      waterTodayMl: 1500,
      daysSinceWorkout: 3,
    }));

    expect(candidates.map((candidate) => candidate.key)).toEqual(["Movement", "Water"]);
    expect(candidates[1].reason).toContain("does not need to be finished all at once");
  });

  it("uses Health Connect activity before asking for more movement", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 70,
      waterTodayMl: 1500,
      daysSinceWorkout: 3,
      stepsToday: 6_200
    }));

    expect(priority.key).toBe("Meal");
  });

  it("makes hydration the priority only when it is meaningfully low", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 16,
      mealsToday: 3,
      proteinTodayG: 120,
      waterTodayMl: 500,
      daysSinceWorkout: 3,
      sleepQuality: null
    }));

    expect(priority.key).toBe("Water");
  });

  it("supports recovery with protein after training when hydration is underway", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 17,
      mealsToday: 2,
      proteinTodayG: 45,
      waterTodayMl: 1_500,
      workoutCompletedToday: true,
      daysSinceWorkout: 0
    }));

    expect(priority.key).toBe("Meal");
    expect(priority.title).toContain("protein");
  });

  it("never turns weight into a daily obligation", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 18,
      mealsToday: 3,
      proteinTodayG: 125,
      waterTodayMl: 2_500,
      workoutCompletedToday: true,
      daysSinceWorkout: 0
    }));

    expect(priority.key).toBeNull();
    expect(priority.cta).toBe("View Progress");
  });

  it("gives a first-time user one gentle starting action", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 9,
      mealsToday: 0,
      proteinTodayG: 0,
      waterTodayMl: 0,
      daysSinceWorkout: null
    }));

    expect(priority.key).toBe("Meal");
    expect(priority.reason).toContain("One honest check-in");
  });

  it("chooses gentle movement after yesterday's workout instead of promoting habits", () => {
    const priority = deterministicTodayPriority(facts({
      localHour: 8,
      mealsToday: 1,
      proteinTodayG: 30,
      waterTodayMl: 800,
      daysSinceWorkout: 1,
      sleepQuality: "poor"
    }));

    expect(priority.key).toBe("Movement");
    expect(priority.title).toContain("gentle movement");
    expect(priority.reason).toContain("trained yesterday");
  });

  it("never includes habits as a core Today priority", () => {
    const candidates = buildTodayPriorityCandidates(facts({
      localHour: 9,
      mealsToday: 2,
      proteinTodayG: 70,
      waterTodayMl: 1_000,
      workoutCompletedToday: true,
      daysSinceWorkout: 0
    }));

    expect(candidates.every((candidate) => candidate.key !== ("Habit" as never))).toBe(true);
  });

  it("uses AI refinement only when the top choices are genuinely close", () => {
    const candidates = buildTodayPriorityCandidates(facts({
      localHour: 16,
      mealsToday: 2,
      proteinTodayG: 70,
      waterTodayMl: 800,
      daysSinceWorkout: 3
    }));

    expect(shouldUseAiPriorityRefinement(candidates)).toBe(true);
    expect(shouldUseAiPriorityRefinement([
      { key: "Movement", title: "Move", reason: "Move", href: "/burn-log", cta: "Log Movement", rank: 90 },
      { key: "Water", title: "Water", reason: "Water", href: "/water-log", cta: "Log Water", rank: 50 }
    ])).toBe(false);
  });
});
