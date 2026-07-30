import { describe, expect, it } from "vitest";
import {
  buildWorkoutCapturePrompt,
  createFallbackWorkoutCapture,
  normalizeWorkoutCaptureResponse
} from "../services/workoutCaptureService";

describe("Workout Capture V1", () => {
  it("parses common workout shorthand without an AI provider", () => {
    const draft = createFallbackWorkoutCapture(
      "Bench press 60kg 3x10, Lat pulldown 45kg 3x12; Plank 3 sets of 45 reps. Total 45 minutes",
      "dictation"
    );

    expect(draft.requiresReview).toBe(true);
    expect(draft.sourceMode).toBe("dictation");
    expect(draft.durationMinutes).toBe(45);
    expect(draft.workoutType).toBe("Strength");
    expect(draft.exercises[0]).toMatchObject({
      name: "Bench press",
      sets: 3,
      reps: "10",
      load: 60,
      loadUnit: "kg",
      movementPattern: "push"
    });
    expect(draft.exercises[1]).toMatchObject({
      name: "Lat pulldown",
      sets: 3,
      reps: "12",
      load: 45,
      loadUnit: "kg",
      movementPattern: "pull"
    });
  });

  it("keeps missing values blank and marks ambiguous notes for confirmation", () => {
    const draft = createFallbackWorkoutCapture("Did some chest and arms", "text");

    expect(draft.durationMinutes).toBeNull();
    expect(draft.exercises[0]).toMatchObject({
      sets: null,
      reps: null,
      load: null,
      loadUnit: null,
      needsConfirmation: true
    });
    expect(draft.uncertainties).toContain("Workout duration was not clear.");
  });

  it("recovers structured JSON from markdown and normalizes unsupported values", () => {
    const response = `\`\`\`json
      {
        "title": "Upper Body",
        "workoutType": "Strength",
        "difficulty": "hard",
        "durationMinutes": 50,
        "confidence": 0.92,
        "uncertainties": [],
        "exercises": [{
          "name": "Dumbbell bench press",
          "originalText": "DB bench 25kg 4x8",
          "sets": 4,
          "reps": "8",
          "load": 25,
          "loadUnit": "kg",
          "durationMinutes": null,
          "restSeconds": 90,
          "note": null,
          "movementPattern": "push",
          "confidence": 0.96,
          "needsConfirmation": false
        }]
      }
    \`\`\``;

    const draft = normalizeWorkoutCaptureResponse(response, "DB bench 25kg 4x8", "text");

    expect(draft.title).toBe("Upper Body");
    expect(draft.difficulty).toBe("moderate");
    expect(draft.exercises[0]).toMatchObject({
      name: "Dumbbell bench press",
      load: 25,
      loadUnit: "kg",
      restSeconds: 90,
      needsConfirmation: false
    });
  });

  it("builds an accuracy-first prompt with confirmed exercise history", () => {
    const prompt = buildWorkoutCapturePrompt("DB bench 3x10", ["Dumbbell Bench Press", "Cable Row"]);

    expect(prompt).toContain("Never invent weights, sets, reps, duration, or exercise names.");
    expect(prompt).toContain("Dumbbell Bench Press");
    expect(prompt).toContain("Cable Row");
    expect(prompt).toContain("Member input: DB bench 3x10");
  });
});
