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

  it("preserves a field-aware AI interpretation without merging regex fallback guesses", () => {
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
          name: "Cable Incline Chest Fly",
          originalText: "Cable incline chest fly\n4 x 10",
          sets: 4,
          reps: "10",
          restSeconds: null,
          note: null,
          confidence: 0.9,
          needsConfirmation: false,
          fieldConfidence: { name: 0.98, sets: 0.98, reps: 0.98, note: 0.95 }
        },
        {
          name: "Machine Chest Press",
          originalText: "Machine chest press\n4 x 6 : 1 sec up 3 sec down",
          sets: 4,
          reps: "6",
          restSeconds: 1,
          note: "Tempo: 1 sec up / 3 sec down",
          confidence: 0.9,
          needsConfirmation: false,
          fieldConfidence: { name: 0.98, sets: 0.98, reps: 0.98, note: 0.95 }
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
          "name": "Dumbbell Bench Press",
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
          "needsConfirmation": false,
          "fieldConfidence": { "name": 0.98, "sets": 0.98, "reps": 0.98, "load": 0.98, "loadUnit": 0.98 }
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
    expect(prompt).toContain("Return fieldConfidence on every exercise");
    expect(prompt).toContain("first two sets 10 last set 8");
    expect(prompt).toContain("A plate count is not a weight");
    expect(prompt).toContain("Treat an exercise-name line followed by a sets/reps line as one exercise.");
    expect(prompt).toContain("Dumbbell Bench Press");
    expect(prompt).toContain("Cable Row");
    expect(prompt).toContain("Member input:\nDB bench 3x10");
  });

  it.each([
    ["bench 80kg 10 10 8", { name: "Bench Press", sets: 3, reps: "10,10,8", load: 80, loadUnit: "kg", loadBasis: "total" }],
    ["bench press 3x8 @80kg", { name: "Bench Press", sets: 3, reps: "8", load: 80, loadUnit: "kg", loadBasis: "total" }],
    ["did bench 80 kilos first two sets 10 last set 8", { name: "Bench Press", sets: 3, reps: "10,10,8", load: 80, loadUnit: "kg", loadBasis: "total" }],
    ["bench 80kg, 10 reps twice then only got 8", { name: "Bench Press", sets: 3, reps: "10,10,8", load: 80, loadUnit: "kg", loadBasis: "total" }],
    ["bench press, 3 sets, 80, reps 10/10/8", { name: "Bench Press", sets: 3, reps: "10/10/8", load: 80, loadUnit: null, loadBasis: "unknown" }],
    ["BP 80kg 10,10,8", { name: "Bench Press", sets: 3, reps: "10,10,8", load: 80, loadUnit: "kg", loadBasis: "total" }],
    ["incline db 22.5 each hand x10 x9 x8", { name: "Incline Dumbbell Press", sets: 3, reps: "10,9,8", load: 22.5, loadUnit: "kg", loadBasis: "per_hand" }]
  ])("keeps Zoe's field-aware meaning for natural input: %s", (input, expected) => {
    const raw = JSON.stringify({
      title: "Strength Workout",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: null,
      confidence: 0.96,
      exercises: [{
        ...expected,
        originalText: input,
        durationMinutes: null,
        restSeconds: null,
        note: null,
        movementPattern: "push",
        confidence: 0.96,
        needsConfirmation: false,
        uncertainFields: [],
        fieldConfidence: { name: 0.98, sets: 0.96, reps: 0.96, load: 0.96, loadUnit: 0.96, loadBasis: 0.94 }
      }]
    });

    expect(normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0]).toMatchObject({
      ...expected,
      needsConfirmation: false,
      uncertainFields: []
    });
  });

  it("keeps drop-set load changes and tempo as structured AI meaning", () => {
    const input = "lat pulldown 4 sets 12 reps last set drop 55→40\nsquat 3x5 tempo 3-1-1";
    const raw = JSON.stringify({
      title: "Pull and Legs",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: null,
      confidence: 0.95,
      exercises: [
        {
          name: "Lat Pulldown", originalText: "lat pulldown 4 sets 12 reps last set drop 55→40", sets: 4, reps: "12", load: 55, loadUnit: null,
          movementPattern: "pull", confidence: 0.96, needsConfirmation: false, trainingMethods: ["drop_set"], dropSet: true,
          loadSteps: [{ value: 55, unit: null, basis: "machine_setting", role: "top", reps: "12", approximate: false, note: null, confidence: 0.95 }, { value: 40, unit: null, basis: "machine_setting", role: "drop", reps: null, approximate: false, note: null, confidence: 0.95 }],
          fieldConfidence: { name: 0.99, sets: 0.98, reps: 0.98, load: 0.9, trainingMethods: 0.98, loadSteps: 0.95 }
        },
        {
          name: "Back Squat", originalText: "squat 3x5 tempo 3-1-1", sets: 3, reps: "5", load: null, loadUnit: null,
          note: "Tempo: 3-1-1", movementPattern: "squat", confidence: 0.97, needsConfirmation: false,
          fieldConfidence: { name: 0.98, sets: 0.98, reps: 0.98, note: 0.97 }
        }
      ]
    });

    const draft = normalizeWorkoutCaptureResponse(raw, input, "text");
    expect(draft.exercises[0].trainingMethods).toContain("drop_set");
    expect(draft.exercises[0].loadSteps?.map((step) => step.value)).toEqual([55, 40]);
    expect(draft.exercises[1]).toMatchObject({ sets: 3, reps: "5", note: "Tempo: 3-1-1" });
  });

  it("preserves alternating sets and mixed cardio circuits without keyword splitting", () => {
    const input = "A1 bench 10 reps A2 rows 12 reps x4 rounds\nrun 5km 28min then 4 rounds pushups 15 / lunges 20";
    const confidence = { name: 0.98, reps: 0.97, groupRounds: 0.96, trainingMethods: 0.96 };
    const raw = JSON.stringify({
      title: "Mixed Session", workoutType: "General Fitness", difficulty: "moderate", durationMinutes: null, confidence: 0.94,
      exercises: [
        { name: "Bench Press", originalText: "A1 bench 10 reps A2 rows 12 reps x4 rounds", sets: 4, reps: "10", movementPattern: "push", confidence: 0.95, needsConfirmation: false, trainingMethods: ["alternating_set"], supersetGroup: "A", groupRounds: 4, fieldConfidence: { ...confidence, sets: 0.96 } },
        { name: "Row", originalText: "A1 bench 10 reps A2 rows 12 reps x4 rounds", sets: 4, reps: "12", movementPattern: "pull", confidence: 0.95, needsConfirmation: false, trainingMethods: ["alternating_set"], supersetGroup: "A", groupRounds: 4, fieldConfidence: { ...confidence, sets: 0.96 } },
        { name: "Run", originalText: "run 5km 28min then 4 rounds pushups 15 / lunges 20", sets: null, reps: null, durationMinutes: 28, movementPattern: "cardio", confidence: 0.97, needsConfirmation: false, fieldConfidence: { name: 0.99, durationMinutes: 0.99 } },
        { name: "Push-Ups", originalText: "run 5km 28min then 4 rounds pushups 15 / lunges 20", sets: 4, reps: "15", movementPattern: "push", confidence: 0.96, needsConfirmation: false, trainingMethods: ["circuit"], supersetGroup: "Circuit 1", groupRounds: 4, fieldConfidence: { ...confidence, sets: 0.97 } },
        { name: "Lunges", originalText: "run 5km 28min then 4 rounds pushups 15 / lunges 20", sets: 4, reps: "20", movementPattern: "squat", confidence: 0.96, needsConfirmation: false, trainingMethods: ["circuit"], supersetGroup: "Circuit 1", groupRounds: 4, fieldConfidence: { ...confidence, sets: 0.97 } }
      ]
    });

    const exercises = normalizeWorkoutCaptureResponse(raw, input, "text").exercises;
    expect(exercises.map((exercise) => exercise.name)).toEqual(["Bench Press", "Row", "Run", "Push-Ups", "Lunges"]);
    expect(exercises[0]).toMatchObject({ sets: 4, reps: "10", supersetGroup: "A" });
    expect(exercises[2]).toMatchObject({ durationMinutes: 28, sets: null });
    expect(exercises[3]).toMatchObject({ groupRounds: 4, reps: "15" });
  });

  it("asks only about sets and reps when 10 x 3 is materially ambiguous", () => {
    const input = "Cable converging lower chest fly 10 x 3";
    const raw = JSON.stringify({
      title: "Chest", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.9,
      exercises: [{
        name: "Cable Converging Lower Chest Fly", originalText: input, sets: 10, reps: "3", load: null, loadUnit: null,
        movementPattern: "push", confidence: 0.9, needsConfirmation: false, uncertainFields: [],
        fieldConfidence: { name: 0.99, sets: 0.9, reps: 0.9 }
      }]
    });

    const exercise = normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0];
    expect(exercise).toMatchObject({ name: "Cable Converging Lower Chest Fly", sets: 10, reps: "3", needsConfirmation: true });
    expect(exercise.uncertainFields).toEqual(["sets", "reps"]);
    expect(exercise.fieldConfidence?.name).toBe(0.99);
  });

  it("uses field confidence so a clear name and load survive uncertain sets and reps", () => {
    const input = "Cable converging lower chest fly maybe 10 x 3 at 25kg";
    const raw = JSON.stringify({
      title: "Chest", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.8,
      exercises: [{
        name: "Cable Converging Lower Chest Fly", originalText: input, sets: 10, reps: "3", load: 25, loadUnit: "kg",
        movementPattern: "push", confidence: 0.8, needsConfirmation: true, uncertainFields: ["sets", "reps"],
        fieldConfidence: { name: 0.99, sets: 0.52, reps: 0.55, load: 0.97, loadUnit: 0.98 }
      }]
    });

    const exercise = normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0];
    expect(exercise.uncertainFields).toEqual(["sets", "reps"]);
    expect(exercise).toMatchObject({ name: "Cable Converging Lower Chest Fly", load: 25, loadUnit: "kg" });
  });

  it("normalizes provider numeric and array rep values without discarding meaning", () => {
    const input = "bench 80kg 10 10 8\nlat pulldown 4 sets 12 reps";
    const raw = JSON.stringify({
      title: "Strength", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.94,
      exercises: [
        {
          name: "Bench Press", originalText: "bench 80kg 10 10 8", sets: 3, reps: [10, 10, 8], load: 80, loadUnit: "kg",
          movementPattern: "push", confidence: 0.95, needsConfirmation: false,
          fieldConfidence: { name: 0.98, sets: 0.95, load: 0.95 }
        },
        {
          name: "Lat Pulldown", originalText: "lat pulldown 4 sets 12 reps", sets: 4, reps: 12, load: null, loadUnit: null,
          movementPattern: "pull", confidence: 0.95, needsConfirmation: false,
          fieldConfidence: { name: 0.98, sets: 0.95 }
        }
      ]
    });

    const exercises = normalizeWorkoutCaptureResponse(raw, input, "text").exercises;
    expect(exercises[0]).toMatchObject({ sets: 3, reps: "10,10,8", load: 80, needsConfirmation: false });
    expect(exercises[1]).toMatchObject({ sets: 4, reps: "12", needsConfirmation: false });
  });

  it("does not ask users to confirm an absent unknown load meaning", () => {
    const input = "squat 3x5 tempo 3-1-1";
    const raw = JSON.stringify({
      title: "Legs", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.92,
      exercises: [{
        name: "Squat", originalText: input, sets: 3, reps: "5", load: null, loadUnit: null, loadBasis: "unknown",
        note: "Tempo: 3-1-1", movementPattern: "squat", confidence: 0.92, needsConfirmation: false,
        fieldConfidence: { name: 0.98, sets: 0.95, reps: 0.95, note: 0.95, loadBasis: 0.4 }
      }]
    });

    const exercise = normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0];
    expect(exercise.needsConfirmation).toBe(false);
    expect(exercise.uncertainFields).toEqual([]);
  });

  it("preserves plate counts as text instead of inventing a numeric weight", () => {
    const input = "leg press 4x10 with 2 plates each side";
    const raw = JSON.stringify({
      title: "Legs", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.93,
      exercises: [{
        name: "Leg Press", originalText: input, sets: 4, reps: "10", load: 2, loadUnit: null, loadBasis: "per_side",
        loadText: null, movementPattern: "squat", confidence: 0.93, needsConfirmation: false,
        loadSteps: [{ value: 2, unit: null, basis: "per_side", role: "working", reps: null, approximate: false, note: null, confidence: 0.93 }],
        setDetails: [{ order: 1, reps: "10", load: 2, loadUnit: null, loadBasis: "per_side", durationValue: null, durationUnit: null, setType: "working", rpe: null, rir: null, approximate: false, note: null }],
        fieldConfidence: { name: 0.98, sets: 0.95, reps: 0.95, load: 0.95, loadBasis: 0.95, loadSteps: 0.95, setDetails: 0.95 }
      }]
    });

    const exercise = normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0];
    expect(exercise).toMatchObject({ load: null, loadUnit: null, loadBasis: "per_side", loadText: "2 plates each side" });
    expect(exercise.loadSteps).toEqual([]);
    expect(exercise.setDetails?.[0]).toMatchObject({ load: null, loadUnit: null, reps: "10" });
  });

  it("counts a rep range as one set entry and keeps explicit sets trusted", () => {
    const input = "shoulder press 20kg 3 sets, 10, 9, last set maybe 7 or 8";
    const raw = JSON.stringify({
      title: "Shoulders", workoutType: "Strength", difficulty: "moderate", durationMinutes: null, confidence: 0.9,
      exercises: [{
        name: "Shoulder Press", originalText: input, sets: 3, reps: "10,9,7-8", load: 20, loadUnit: "kg",
        movementPattern: "push", confidence: 0.9, needsConfirmation: true, uncertainFields: ["reps"],
        fieldConfidence: { name: 0.98, sets: 0.95, reps: 0.55, load: 0.95, loadUnit: 0.95 }
      }]
    });

    const exercise = normalizeWorkoutCaptureResponse(raw, input, "text").exercises[0];
    expect(exercise).toMatchObject({ sets: 3, reps: "10,9,7-8", needsConfirmation: true });
    expect(exercise.uncertainFields).toEqual(["reps"]);
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
