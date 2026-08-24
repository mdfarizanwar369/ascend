import { describe, expect, it } from "vitest";
import { createRepeatWorkoutCaptureDraft } from "@ascend/shared";
import {
  buildWorkoutCapturePrompt,
  createFallbackWorkoutCapture,
  normalizeWorkoutCaptureInput,
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
      name: "Bench Press",
      sets: 3,
      reps: "10",
      load: 60,
      loadUnit: "kg",
      movementPattern: "push"
    });
    expect(draft.exercises[1]).toMatchObject({
      name: "Lat Pulldown",
      sets: 3,
      reps: "12",
      load: 45,
      loadUnit: "kg",
      movementPattern: "pull"
    });
  });

  it("keeps line-paired chest exercises distinct and treats tempo as tempo", () => {
    const input = [
      "Plated chest lress",
      "4 serts x 10",
      "Cable incline chest fly",
      "4 x 10",
      "Machine chest press",
      "4 x 6 : 1 sec up 3 sec down&#x20;",
      "Cable converging lower chest fly&#x20;",
      "10 x 3"
    ].join("\n");

    const draft = createFallbackWorkoutCapture(input, "dictation");

    expect(draft.originalInput).not.toContain("&#x20;");
    expect(draft.exercises).toHaveLength(4);
    expect(draft.exercises[0]).toMatchObject({
      name: "Plate-Loaded Chest Press",
      sets: 4,
      reps: "10",
      restSeconds: null,
      note: null,
      needsConfirmation: false
    });
    expect(draft.exercises[1]).toMatchObject({
      name: "Cable Incline Chest Fly",
      sets: 4,
      reps: "10"
    });
    expect(draft.exercises[2]).toMatchObject({
      name: "Machine Chest Press",
      sets: 4,
      reps: "6",
      restSeconds: null,
      durationMinutes: null,
      durationValue: null,
      note: "Tempo: 1 sec up / 3 sec down"
    });
    expect(draft.exercises[3]).toMatchObject({
      name: "Cable Converging Lower Chest Fly",
      sets: 10,
      reps: "3",
      needsConfirmation: true,
      uncertainFields: expect.arrayContaining(["sets", "reps"])
    });
  });

  it("uses the evidence parser to correct an inaccurate AI interpretation", () => {
    const input = [
      "Cable incline chest fly",
      "4 x 10",
      "Machine chest press",
      "4 x 6 : 1 sec up 3 sec down"
    ].join("\n");
    const raw = JSON.stringify({
      title: "Chest",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: null,
      confidence: 0.9,
      uncertainties: [],
      exercises: [
        {
          name: "Flyes",
          originalText: "Cable incline chest fly\n4 x 10",
          sets: 4,
          reps: "10",
          restSeconds: null,
          note: null,
          confidence: 0.9,
          needsConfirmation: false
        },
        {
          name: "Flyes",
          originalText: "Machine chest press\n4 x 6 : 1 sec up 3 sec down",
          sets: 4,
          reps: "6",
          restSeconds: 1,
          note: "1 sec up 3 sec down",
          confidence: 0.9,
          needsConfirmation: false
        }
      ]
    });

    const draft = normalizeWorkoutCaptureResponse(raw, input, "text");

    expect(draft.exercises.map((item) => item.name)).toEqual([
      "Cable Incline Chest Fly",
      "Machine Chest Press"
    ]);
    expect(draft.exercises[1]).toMatchObject({
      restSeconds: null,
      durationValue: null,
      note: "Tempo: 1 sec up / 3 sec down"
    });
  });

  it("cleans pasted whitespace entities without changing workout wording", () => {
    expect(normalizeWorkoutCaptureInput("Machine row&#x20;\n3 x 12&nbsp; ")).toBe("Machine row\n3 x 12");
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
      name: "Dumbbell Bench Press",
      load: 25,
      loadUnit: "kg",
      restSeconds: null,
      needsConfirmation: false
    });
  });

  it("builds an accuracy-first prompt with confirmed exercise history", () => {
    const prompt = buildWorkoutCapturePrompt("DB bench 3x10", ["Dumbbell Bench Press", "Cable Row"]);

    expect(prompt).toContain("Never invent weights, sets, reps, duration, or exercise names.");
    expect(prompt).toContain("Tempo such as '1 sec up 3 sec down' belongs in note");
    expect(prompt).toContain("Treat an exercise-name line followed by a sets/reps line as one exercise.");
    expect(prompt).toContain("Dumbbell Bench Press");
    expect(prompt).toContain("Cable Row");
    expect(prompt).toContain("Member input:\nDB bench 3x10");
  });

  it("converts saved structured workout metadata into a safe repeat draft", () => {
    const draft = createRepeatWorkoutCaptureDraft({
      workoutTitle: "Pull Day",
      workoutType: "Strength",
      workoutDifficulty: "Challenging",
      durationMinutes: 50,
      exercises: [
        {
          name: "Cable row",
          sets: 3,
          reps: "10",
          load: 45,
          loadUnit: "kg",
          rest: "90 sec",
          movementPattern: "pull",
          section: "Back",
          loadBasis: "total",
          topLoad: 50,
          backoffLoad: 45,
          trainingMethods: ["back_off"],
          loadSteps: [
            { value: 50, unit: "kg", basis: "total", role: "top", reps: "8", approximate: false, note: null, confidence: 0.96 },
            { value: 45, unit: "kg", basis: "total", role: "backoff", reps: "10", approximate: false, note: null, confidence: 0.96 }
          ],
          setDetails: []
        },
        { name: "", sets: 2, reps: "12" }
      ]
    });

    expect(draft).toMatchObject({
      sourceMode: "repeat",
      title: "Pull Day",
      workoutType: "Strength",
      difficulty: "challenging",
      durationMinutes: 50,
      requiresReview: true
    });
    expect(draft?.exercises).toHaveLength(1);
    expect(draft?.exercises[0]).toMatchObject({
      load: 45,
      loadUnit: "kg",
      restSeconds: 90,
      movementPattern: "pull",
      section: "Back",
      loadBasis: "total",
      topLoad: 50,
      backoffLoad: 45,
      trainingMethods: ["back_off"]
    });
    expect(draft?.exercises[0]?.loadSteps).toHaveLength(2);
  });
});
