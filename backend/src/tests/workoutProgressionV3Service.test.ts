import { describe, expect, it } from "vitest";
import type { WorkoutObservation, HistoricalExerciseObservation } from "../services/workoutProgressionV3Service";
import { buildWorkoutProgressionIntelligenceV3, resolveExerciseKey } from "../services/workoutProgressionV3Service";

function workout(overrides: Partial<WorkoutObservation> = {}): WorkoutObservation {
  return {
    sourceEventId: "current-event",
    userId: "user-1",
    sourceType: "ai_workout_capture",
    workoutTitle: "Upper Body Strength",
    workoutType: "Strength",
    difficulty: "moderate",
    completedAt: "2026-07-30T10:00:00.000Z",
    exercises: [{ name: "Bench Press", sets: 3, reps: "10", load: 60, loadUnit: "kg", confidence: 0.95 }],
    ...overrides
  };
}

function observation(overrides: Partial<HistoricalExerciseObservation> = {}): HistoricalExerciseObservation {
  return {
    sourceEventId: "earlier-event",
    exerciseKey: "bench press",
    displayName: "Bench Press",
    sets: 3,
    repsText: "10",
    totalReps: 30,
    load: 55,
    loadUnit: "kg",
    durationSeconds: null,
    difficulty: "moderate",
    confidence: 0.95,
    completedAt: "2026-07-27T10:00:00.000Z",
    ...overrides
  };
}

describe("Workout Progression Intelligence V3", () => {
  it("creates an observed baseline without history", () => {
    const result = buildWorkoutProgressionIntelligenceV3({ workout: workout(), history: [] });
    expect(result?.overallStatus).toBe("baseline");
    expect(result?.exerciseInsights[0].nextSessionSuggestion).toContain("Repeat");
  });

  it("rejects plans and quick activity as progression evidence", () => {
    expect(buildWorkoutProgressionIntelligenceV3({ workout: workout({ sourceType: "coach_zoe_workout_planner" }), history: [] })).toBeNull();
    expect(buildWorkoutProgressionIntelligenceV3({ workout: workout({ sourceType: "manual" }), history: [] })).toBeNull();
  });

  it("detects a verified load personal best", () => {
    const result = buildWorkoutProgressionIntelligenceV3({ workout: workout(), history: [observation()] });
    expect(result?.overallStatus).toBe("personal_best");
    expect(result?.achievements[0]).toContain("60kg");
    expect(result?.nextSessionFocus).toContain("60kg");
  });

  it("does not claim a load best when repetitions collapse", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ exercises: [{ name: "Bench Press", sets: 3, reps: "4", load: 60, loadUnit: "kg" }] }),
      history: [observation()]
    });
    expect(result?.overallStatus).not.toBe("personal_best");
    expect(result?.overallStatus).not.toBe("progressed");
    expect(JSON.stringify(result)).not.toMatch(/failed|worse|declined/i);
  });

  it("detects a rep personal best at the same load", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ exercises: [{ name: "Bench Press", sets: 3, reps: "10,10,10", load: 55, loadUnit: "kg" }] }),
      history: [observation({ repsText: "10,9,8", totalReps: 27 })]
    });
    expect(result?.overallStatus).toBe("personal_best");
    expect(result?.achievements[0]).toContain("27 to 30");
  });

  it("requires four comparable performances before showing a plateau signal", () => {
    const history = [0, 1, 2].map((index) => observation({ sourceEventId: `event-${index}`, completedAt: `2026-07-${27 - index}T10:00:00.000Z`, load: 60 }));
    const result = buildWorkoutProgressionIntelligenceV3({ workout: workout(), history });
    expect(result?.overallStatus).toBe("plateau_signal");
    expect(result?.nextSessionFocus).toContain("one variable");
  });

  it("recognizes an explicit recovery or deload context", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ workoutTitle: "Upper Body Deload", difficulty: "easy", exercises: [{ name: "Bench Press", sets: 2, reps: "8", load: 40, loadUnit: "kg" }] }),
      history: [observation({ load: 55 })]
    });
    expect(result?.overallStatus).toBe("planned_deload");
    expect(result?.exerciseInsights[0].summary).toContain("intentionally lighter");
  });

  it("supports timed bodyweight or cardio observations", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ exercises: [{ name: "Plank", sets: null, reps: null, load: null, loadUnit: null, duration: "3 min" }] }),
      history: [observation({ exerciseKey: "plank", displayName: "Plank", sets: null, repsText: null, totalReps: null, load: null, loadUnit: null, durationSeconds: 120 })]
    });
    expect(result?.overallStatus).toBe("personal_best");
    expect(result?.achievements[0]).toContain("duration best");
  });

  it("merges duplicate exercise entries without creating false drop-set progression", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ exercises: [
        { name: "Bench Press", sets: 2, reps: "8", load: 60, loadUnit: "kg" },
        { name: "Bench Press", sets: 1, reps: "12", load: 40, loadUnit: "kg" }
      ] }),
      history: [observation()]
    });
    expect(result?.exerciseInsights).toHaveLength(1);
    expect(result?.overallStatus).toBe("not_comparable");
    expect(result?.overallStatus).not.toBe("personal_best");
  });

  it("does not call old matching performances a plateau", () => {
    const history = [0, 1, 2].map((index) => observation({
      sourceEventId: `old-${index}`,
      completedAt: `2025-01-0${index + 1}T10:00:00.000Z`,
      load: 60
    }));
    const result = buildWorkoutProgressionIntelligenceV3({ workout: workout(), history });
    expect(result?.overallStatus).toBe("maintained");
  });

  it("does not compare kg and lb records", () => {
    const result = buildWorkoutProgressionIntelligenceV3({
      workout: workout({ exercises: [{ name: "Bench Press", sets: 3, reps: "10", load: 132, loadUnit: "lb" }] }),
      history: [observation({ load: 55, loadUnit: "kg" })]
    });
    expect(result?.overallStatus).toBe("not_comparable");
  });

  it("uses confirmed aliases but never fuzzy-matches automatically", () => {
    expect(resolveExerciseKey("DB Row", [{ aliasKey: "dumbbell row", canonicalKey: "single arm dumbbell row", relationship: "same" }])).toBe("single arm dumbbell row");
    expect(resolveExerciseKey("Incline Bench Press")).toBe("incline bench press");
    expect(resolveExerciseKey("Incline Bench Press")).not.toBe("bench press");
  });

  it("keeps the output compact and free of trainer-private fields", () => {
    const result = buildWorkoutProgressionIntelligenceV3({ workout: workout(), history: [observation()] });
    expect(result?.achievements.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(result)).not.toContain("trainerNextSessionNote");
    expect(JSON.stringify(result)).not.toContain("rawInput");
  });
});
