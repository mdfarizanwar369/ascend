import { describe, expect, it } from "vitest";
import type { WorkoutCaptureDraft } from "@ascend/shared";
import { buildTrainerSessionIntelligence, buildTrainerSessionNarratives, toClientCoachedSession, trainerIntelligenceFromProgressionV3, trainerSessionDraftText } from "../services/trainerSessionService";

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

describe("trainer session copilot", () => {
  it("uses shared V3 personal-best intelligence after completion", () => {
    const fallback = buildTrainerSessionIntelligence(draft(), null);
    const intelligence = trainerIntelligenceFromProgressionV3({
      version: "workout_progression_v3",
      evidenceType: "observed_performance",
      overallStatus: "personal_best",
      headline: "1 verified personal best.",
      achievements: ["Bench Press: new verified load best at 60kg."],
      reviewNotes: [],
      nextSessionFocus: "Start with 60kg again.",
      exerciseInsights: [{ exerciseName: "Bench Press", exerciseKey: "bench press", status: "personal_best", summary: "Bench Press: new verified load best at 60kg.", current: { sets: 3, reps: "10", totalReps: 30, load: 60, loadUnit: "kg" }, previous: null, currentDurationSeconds: null, previousDurationSeconds: null, comparableObservationCount: 3, confidence: 1, nextSessionSuggestion: "Start with 60kg again." }],
      confidence: 1
    }, fallback);
    expect(intelligence.headline).toContain("personal best");
    expect(intelligence.nextSessionStartingPoint).toContain("60kg");
    expect(intelligence.exerciseComparisons[0].status).toBe("progressed");
  });

  it("detects higher confirmed load as progression", () => {
    const intelligence = buildTrainerSessionIntelligence(draft(), draft({ exercises: [{ ...draft().exercises[0], load: 55 }] }));
    expect(intelligence.headline).toContain("1 verified progression");
    expect(intelligence.highlights[0]).toContain("55kg to 60kg");
  });

  it("detects more repetitions at the same load", () => {
    const intelligence = buildTrainerSessionIntelligence(
      draft({ exercises: [{ ...draft().exercises[0], reps: "10,10,10" }] }),
      draft({ exercises: [{ ...draft().exercises[0], reps: "10,8,8" }] })
    );
    expect(intelligence.exerciseComparisons[0]).toMatchObject({ status: "progressed" });
    expect(intelligence.highlights[0]).toContain("more total repetitions");
  });

  it("flags a reduced load for trainer context without calling it failure", () => {
    const intelligence = buildTrainerSessionIntelligence(
      draft({ exercises: [{ ...draft().exercises[0], load: 50 }] }),
      draft({ exercises: [{ ...draft().exercises[0], load: 60 }] })
    );
    expect(intelligence.watchouts[0]).toContain("Check context");
    expect(intelligence.clientCelebration).not.toMatch(/failed|worse|declined/i);
  });

  it("does not claim progress when details are not comparable", () => {
    const intelligence = buildTrainerSessionIntelligence(
      draft({ exercises: [{ ...draft().exercises[0], load: null, reps: null }] }),
      draft({ exercises: [{ ...draft().exercises[0], load: null, reps: null }] })
    );
    expect(intelligence.exerciseComparisons[0].status).toBe("not_comparable");
    expect(intelligence.headline).not.toContain("progression");
  });

  it("does not turn ambiguous rep ranges into false progression", () => {
    const intelligence = buildTrainerSessionIntelligence(
      draft({ exercises: [{ ...draft().exercises[0], load: null, reps: "10-12" }] }),
      draft({ exercises: [{ ...draft().exercises[0], load: null, reps: "8-10" }] })
    );
    expect(intelligence.exerciseComparisons[0].status).toBe("not_comparable");
    expect(intelligence.headline).not.toContain("progression");
  });

  it("keeps private planning and watchouts out of the client receipt", () => {
    const workout = draft();
    const intelligence = buildTrainerSessionIntelligence(workout, null);
    intelligence.watchouts = ["Private load concern"];
    const clientReceipt = toClientCoachedSession({
      id: "session-1", clientId: "client-1", trainerId: "trainer-1", createdByUserId: "user-1",
      trainerName: "Coach Sam", clientName: "Alex", status: "completed", startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(), durationMinutes: 45, rawInput: "private raw notes", workoutDraft: workout,
      narratives: { clientRecap: "Session complete.", betweenSessionFocus: "Hydrate.", trainerNextSessionNote: "Private trainer plan" },
      intelligence, workoutEventId: "event-1", estimatedCaloriesBurned: 250, caloriesLabel: "Estimated Calories Burned",
      version: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    expect(clientReceipt).not.toHaveProperty("rawInput");
    expect(clientReceipt).not.toHaveProperty("trainerNextSessionNote");
    expect(clientReceipt).not.toHaveProperty("watchouts");
    expect(JSON.stringify(clientReceipt)).not.toContain("Private load concern");
    expect(JSON.stringify(clientReceipt)).not.toContain("Private trainer plan");
  });
});
