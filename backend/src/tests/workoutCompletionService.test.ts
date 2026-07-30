import { describe, expect, it } from "vitest";
import { createWorkoutCompletionSummary } from "../services/workoutCompletionService";

describe("Workout completion service", () => {
  it("estimates calories with MET values for generated workouts", () => {
    const summary = createWorkoutCompletionSummary({
      workoutTitle: "Outdoor Mobility Flow",
      workoutType: "Mobility",
      difficulty: "easy",
      durationMinutes: 40,
      weightKg: 74,
      exercises: [{ name: "World's greatest stretch", sets: 2, reps: "5 each side" }]
    });

    expect(summary.workoutType).toBe("Mobility");
    expect(summary.caloriesSource).toBe("estimated_met");
    expect(summary.estimatedCaloriesBurned).toBeGreaterThan(100);
    expect(summary.estimatedCaloriesBurned).toBe(summary.caloriesBurned);
  });

  it("prefers provider calories when supplied and keeps the estimate for labeling", () => {
    const summary = createWorkoutCompletionSummary({
      workoutTitle: "Full Body Strength",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: 45,
      weightKg: 82,
      actualCaloriesBurned: 410,
      exercises: [{ name: "Goblet squat", sets: 3, reps: "10" }]
    });

    expect(summary.caloriesSource).toBe("health_provider_actual");
    expect(summary.caloriesBurned).toBe(410);
    expect(summary.estimatedCaloriesBurned).toBeGreaterThan(0);
  });

  it("falls back to a sensible default weight and returns coach-style copy", () => {
    const summary = createWorkoutCompletionSummary({
      workoutTitle: "Hotel Reset Session",
      workoutType: "Recovery",
      difficulty: "easy",
      durationMinutes: 20,
      exercises: [{ name: "Easy walk", duration: "10 min" }]
    });

    expect(summary.weightKgUsed).toBe(75);
    expect(summary.coachMessage.length).toBeGreaterThan(20);
    expect(summary.exerciseList[0]?.name).toBe("Easy walk");
  });

  it("preserves confirmed capture load and movement metadata", () => {
    const summary = createWorkoutCompletionSummary({
      workoutTitle: "Upper Body Strength",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: 45,
      exercises: [{
        name: "Dumbbell bench press",
        sets: 3,
        reps: "10",
        load: 25,
        loadUnit: "kg",
        movementPattern: "push",
        confidence: 0.96
      }]
    });

    expect(summary.exerciseList[0]).toMatchObject({
      load: 25,
      loadUnit: "kg",
      movementPattern: "push",
      confidence: 0.96
    });
  });
});
