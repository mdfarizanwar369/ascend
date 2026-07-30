import { describe, expect, it } from "vitest";
import type { WorkoutCaptureDraft } from "@ascend/shared";
import { buildTrainerSessionNarratives, trainerSessionDraftText } from "../services/trainerSessionService";

function draft(overrides: Partial<WorkoutCaptureDraft> = {}): WorkoutCaptureDraft {
  return {
    version: "workout_capture_v1",
    sourceMode: "dictation",
    originalInput: "bench 60kg 3x10",
    title: "Upper Body Strength",
    workoutType: "Strength",
    difficulty: "moderate",
    durationMinutes: 45,
    exercises: [{
      name: "Bench Press",
      originalText: "bench 60kg 3x10",
      sets: 3,
      reps: "10",
      load: 60,
      loadUnit: "kg",
      durationMinutes: null,
      restSeconds: 90,
      note: null,
      movementPattern: "push",
      confidence: 0.95,
      needsConfirmation: false
    }],
    confidence: 0.95,
    uncertainties: [],
    requiresReview: true,
    ...overrides
  };
}

describe("trainer session narratives", () => {
  it("reports a verified load progression from the prior session", () => {
    const result = buildTrainerSessionNarratives(draft(), "Alex", draft({ exercises: [{ ...draft().exercises[0], load: 55 }] }));
    expect(result.clientRecap).toContain("moved from 55kg to 60kg");
    expect(result.trainerNextSessionNote).toContain("confirmed progression");
  });

  it("does not invent progression without a comparable previous exercise", () => {
    const result = buildTrainerSessionNarratives(draft(), "Alex", null);
    expect(result.clientRecap).toContain("saved for future comparison");
    expect(result.clientRecap).not.toContain("improved");
  });

  it("uses recovery language for mobility sessions", () => {
    const result = buildTrainerSessionNarratives(draft({ title: "Mobility Reset", workoutType: "Mobility", difficulty: "easy" }), "Alex");
    expect(result.betweenSessionFocus).toContain("comfortable movement");
    expect(result.betweenSessionFocus).not.toMatch(/diagnos|injury|treat/i);
  });

  it("surfaces uncertain AI fields for the trainer to review", () => {
    const result = buildTrainerSessionNarratives(draft({ uncertainties: ["Bench press load is unclear."] }), "Alex");
    expect(result.trainerNextSessionNote).toContain("bench press load is unclear");
  });

  it("turns a repeated session into editable gym-floor shorthand", () => {
    const text = trainerSessionDraftText(draft());
    expect(text).toBe("Bench Press 3x10 60kg");
  });
});
