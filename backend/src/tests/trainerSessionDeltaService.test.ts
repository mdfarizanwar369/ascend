import { describe, expect, it } from "vitest";
import type { TrainerSessionDelta, TrainerSessionDeltaChange, WorkoutCaptureDraft, WorkoutCaptureExercise } from "@ascend/shared";
import {
  buildTrainerSessionDeltaPrompt,
  createFallbackTrainerSessionDelta,
  mergeTrainerSessionDelta,
  normalizeTrainerSessionDeltaResponse
} from "../services/trainerSessionDeltaService";

function exercise(name: string, overrides: Partial<WorkoutCaptureExercise> = {}): WorkoutCaptureExercise {
  return {
    name,
    originalText: name,
    sets: 3,
    reps: "10",
    load: 60,
    loadUnit: "kg",
    durationMinutes: null,
    restSeconds: 90,
    note: null,
    movementPattern: "other",
    confidence: 0.95,
    needsConfirmation: false,
    ...overrides
  };
}

function workout(exercises: WorkoutCaptureExercise[] = [exercise("Bench Press"), exercise("Walking Lunges", { load: 20 })]): WorkoutCaptureDraft {
  return {
    version: "workout_capture_v1",
    sourceMode: "repeat",
    originalInput: "previous confirmed session",
    title: "Full Body Strength",
    workoutType: "Strength",
    difficulty: "moderate",
    durationMinutes: 45,
    exercises,
    confidence: 0.95,
    uncertainties: [],
    requiresReview: true
  };
}

function change(overrides: Partial<TrainerSessionDeltaChange>): TrainerSessionDeltaChange {
  return {
    action: "update",
    targetExerciseName: "Bench Press",
    name: null,
    sets: null,
    reps: null,
    load: null,
    loadDelta: null,
    loadUnit: null,
    durationMinutes: null,
    restSeconds: null,
    note: null,
    originalText: "bench changed",
    confidence: 0.95,
    needsConfirmation: false,
    ...overrides
  };
}

function delta(changes: TrainerSessionDeltaChange[]): TrainerSessionDelta {
  return { changes, durationMinutes: null, workoutType: null, difficulty: null, confidence: 0.95, uncertainties: [] };
}

describe("trainer session delta parsing", () => {
  it("parses common gym-floor shorthand without AI", () => {
    const result = createFallbackTrainerSessionDelta("Bench Press +5kg; Walking Lunges skipped; add bike 10 min");
    expect(result.changes).toHaveLength(3);
    expect(result.changes[0]).toMatchObject({ action: "update", targetExerciseName: "Bench Press", loadDelta: 5, loadUnit: "kg" });
    expect(result.changes[1]).toMatchObject({ action: "remove", targetExerciseName: "Walking Lunges" });
    expect(result.changes[2]).toMatchObject({ action: "add", durationMinutes: 10 });
  });

  it("recovers safely from malformed AI output", () => {
    const result = normalizeTrainerSessionDeltaResponse("Here is the result but no JSON", "Bench Press +5kg");
    expect(result.changes[0]).toMatchObject({ targetExerciseName: "Bench Press", loadDelta: 5 });
  });

  it("normalizes JSON wrapped in markdown and ignores unsupported fields", () => {
    const result = normalizeTrainerSessionDeltaResponse('```json\n{"changes":[{"action":"update","targetExerciseName":"Bench Press","sets":4,"unsafe":"ignored","confidence":0.9}],"confidence":0.9}\n```', "bench four sets");
    expect(result.changes[0]).toMatchObject({ action: "update", targetExerciseName: "Bench Press", sets: 4 });
    expect(result.changes[0]).not.toHaveProperty("unsafe");
  });

  it("instructs the model to return changes only against exact base names", () => {
    const prompt = buildTrainerSessionDeltaPrompt("bench +5kg", workout());
    expect(prompt).toContain("Return changes only");
    expect(prompt).toContain("must exactly match one base exercise name");
    expect(prompt).toContain("Bench Press");
    expect(prompt).toContain("never invent a change");
  });
});

describe("trainer session deterministic delta merge", () => {
  it("applies a relative load and preserves every unspecified field", () => {
    const base = workout();
    const result = mergeTrainerSessionDelta(base, delta([change({ loadDelta: 5, loadUnit: "kg" })]), "bench +5kg");
    expect(result.draft.exercises[0]).toMatchObject({ name: "Bench Press", sets: 3, reps: "10", load: 65, restSeconds: 90 });
    expect(result.draft.exercises[1]).toEqual(base.exercises[1]);
  });

  it("applies only supplied absolute fields", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ sets: 4, reps: "8" })]), "bench 4x8");
    expect(result.draft.exercises[0]).toMatchObject({ sets: 4, reps: "8", load: 60, loadUnit: "kg" });
  });

  it("removes an exactly matched exercise", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ action: "remove", targetExerciseName: "Walking Lunges" })]), "lunges skipped");
    expect(result.draft.exercises.map((item) => item.name)).toEqual(["Bench Press"]);
  });

  it("never removes the final exercise", () => {
    const result = mergeTrainerSessionDelta(workout([exercise("Bench Press")]), delta([change({ action: "remove" })]), "bench skipped");
    expect(result.draft.exercises).toHaveLength(1);
    expect(result.appliedChanges).toHaveLength(0);
    expect(result.delta.uncertainties[0]).toContain("needs at least one exercise");
  });

  it("adds a timed movement without changing the base movements", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ action: "add", targetExerciseName: null, name: "Bike", durationMinutes: 10, originalText: "add bike 10 min" })]), "add bike 10 min");
    expect(result.draft.exercises).toHaveLength(3);
    expect(result.draft.exercises[2]).toMatchObject({ name: "Bike", durationMinutes: 10 });
  });

  it("rejects an unknown target instead of guessing", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ targetExerciseName: "Deadlift", loadDelta: 5 })]), "deadlift +5kg");
    expect(result.draft.exercises).toHaveLength(2);
    expect(result.appliedChanges).toHaveLength(0);
    expect(result.delta.changes).toHaveLength(0);
    expect(result.delta.uncertainties[0]).toContain("Could not safely match Deadlift");
  });

  it("rejects an ambiguous partial target", () => {
    const base = workout([exercise("Bench Press"), exercise("Incline Bench Press")]);
    const result = mergeTrainerSessionDelta(base, delta([change({ targetExerciseName: "Bench", loadDelta: 5 })]), "bench +5kg");
    expect(result.draft.exercises.map((item) => item.load)).toEqual([60, 60]);
    expect(result.appliedChanges).toHaveLength(0);
    expect(result.delta.changes).toHaveLength(0);
  });

  it("rejects incompatible relative-load units and does not report the change as applied", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ loadDelta: 5, loadUnit: "lb" })]), "bench +5lb");
    expect(result.draft.exercises[0].load).toBe(60);
    expect(result.appliedChanges).toHaveLength(0);
    expect(result.delta.changes).toHaveLength(0);
    expect(result.delta.uncertainties[0]).toContain("relative load change");
  });

  it("does not mutate the confirmed base workout", () => {
    const base = workout();
    const snapshot = structuredClone(base);
    mergeTrainerSessionDelta(base, delta([change({ loadDelta: 5, loadUnit: "kg" })]), "bench +5kg");
    expect(base).toEqual(snapshot);
  });

  it("keeps null optional values blank rather than clearing existing data", () => {
    const result = mergeTrainerSessionDelta(workout(), delta([change({ sets: 4, reps: null, load: null, note: null })]), "bench four sets");
    expect(result.draft.exercises[0]).toMatchObject({ sets: 4, reps: "10", load: 60, note: null });
  });
});
