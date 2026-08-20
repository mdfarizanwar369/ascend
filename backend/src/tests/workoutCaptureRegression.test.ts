import { describe, expect, it } from "vitest";
import type { WorkoutCaptureDraft, WorkoutCaptureExercise } from "@ascend/shared";
import { createFallbackWorkoutCapture, normalizeWorkoutCaptureResponse } from "../services/workoutCaptureService";
import { savedWorkoutCaptureExerciseSchema, workoutCaptureDraftSchema } from "../schemas/workoutCaptureSchemas";
import { CANONICAL_WORKOUT, WORKOUT_CAPTURE_FIXTURES } from "./fixtures/workoutCaptureFixtures";

function parse(input: string) {
  return createFallbackWorkoutCapture(input, "text");
}

function exercise(draft: WorkoutCaptureDraft, name: string) {
  const found = draft.exercises.find((item) => item.name.toLowerCase().includes(name.toLowerCase()));
  expect(found, `Expected exercise containing "${name}"`).toBeTruthy();
  return found as WorkoutCaptureExercise;
}

describe("Detailed Workout rich capture regression suite", () => {
  it("captures the canonical chest/back workout without flattening its evidence", () => {
    const draft = parse(CANONICAL_WORKOUT);
    const warmupWalk = exercise(draft, "Incline Walk");
    const warmupPress = draft.exercises.find((item) => item.name === "Incline Smith Press");
    const smith = exercise(draft, "Incline Smith Machine");
    const dumbbell = exercise(draft, "Incline Dumbbell");
    const pecDeck = exercise(draft, "Pec Deck");
    const flyes = exercise(draft, "Cable Flyes");
    const row = exercise(draft, "Seated Cable Row");
    const lat = exercise(draft, "Wide-Grip Lat");
    const straightArm = exercise(draft, "Straight-Arm");
    const facePulls = exercise(draft, "Face Pulls");
    const tricep = exercise(draft, "Tricep Pulldown");
    const curl = exercise(draft, "Cable Bicep Curl");

    expect(warmupWalk).toMatchObject({ section: "Warm-up", durationMinutes: 5, warmup: true });
    expect(warmupPress).toMatchObject({ section: "Warm-up", sets: 2, warmup: true });
    expect(smith).toMatchObject({ section: "Chest", topLoad: 25, backoffLoad: 20, loadBasis: "per_side" });
    expect(smith.loadSteps?.find((step) => step.role === "backoff")).toMatchObject({ value: 20, reps: "8", basis: "per_side" });
    expect(dumbbell).toMatchObject({ startingLoad: 15, workingLoad: 20, loadBasis: "per_hand" });
    expect(pecDeck).toMatchObject({ sets: 7, repRangeMin: 10, repRangeMax: 12, approximateReps: true });
    expect(pecDeck.trainingMethods).toEqual(expect.arrayContaining(["fst_7", "short_rest"]));
    expect(flyes).toMatchObject({ sets: null, reps: null, load: null });
    expect(row).toMatchObject({ reps: "18", rpe: 9 });
    expect(lat).toMatchObject({ load: 59, sets: 7, reps: "12", approximateReps: true });
    expect(lat.trainingMethods).toContain("short_rest");
    expect(straightArm).toMatchObject({ sets: 7, repRangeMin: 10, repRangeMax: 12 });
    expect(facePulls).toMatchObject({ reps: "30", setType: "finisher" });
    expect(tricep).toMatchObject({ sets: 3, startingLoad: 11.3, workingLoad: 9, loadBasis: "per_side" });
    expect(curl.sets).toBe(3);
    expect(curl.supersetGroup).toBeTruthy();
    expect(curl.supersetGroup).toBe(tricep.supersetGroup);
  });

  it("accepts the rich canonical draft through the production validation contract", () => {
    const validated = workoutCaptureDraftSchema.parse(parse(CANONICAL_WORKOUT));
    expect(validated.exercises).toHaveLength(14);
    expect(validated.exercises.find((item) => item.name === "Incline Smith Machine Press")?.loadSteps).toHaveLength(2);
  });

  it("keeps the legacy save payload valid without requiring rich capture fields", () => {
    const validated = savedWorkoutCaptureExerciseSchema.parse({
      name: "Bench press",
      sets: 3,
      reps: "10",
      load: 60,
      loadUnit: "kg",
      movementPattern: "push"
    });

    expect(validated).toMatchObject({
      originalText: null,
      needsConfirmation: false,
      confidence: 0.5
    });
    expect(validated.section).toBeUndefined();
  });

  it("A: extracts clean load, sets, and reps", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.structured);
    expect(exercise(draft, "Bench")).toMatchObject({ load: 80, loadUnit: "kg", sets: 3, reps: "8" });
    expect(exercise(draft, "Lat Pulldown")).toMatchObject({ load: 55, sets: 3, reps: "12" });
    expect(exercise(draft, "Leg Press")).toMatchObject({ load: 140, sets: 4, reps: "10" });
  });

  it("B: groups shorthand load/reps under the preceding exercise", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.shorthand);
    const bench = exercise(draft, "Bench");
    const incline = exercise(draft, "Incline Dumbbell");
    expect(bench.loadSteps?.map((step) => [step.value, step.reps])).toEqual([[60, "10"], [70, "8"], [75, "6"]]);
    expect(incline.loadSteps?.map((step) => [step.value, step.reps])).toEqual([[20, "10"], [22.5, "8"]]);
    expect(incline.loadBasis).toBe("per_hand");
  });

  it("C: understands spoken-style loading and conversational sets", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.spoken);
    expect(exercise(draft, "Squat").loadSteps?.map((step) => step.value)).toEqual([60, 80, 100]);
    expect(exercise(draft, "Leg Extension")).toMatchObject({ sets: 4, reps: "12", approximateReps: true });
    expect(exercise(draft, "Walking Lunges").sets).toBe(3);
  });

  it("D: preserves superset grouping and round rest", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.superset);
    const curl = exercise(draft, "Cable Curl");
    const pushdown = exercise(draft, "Rope Pushdown");
    expect(curl.supersetGroup).toBe(pushdown.supersetGroup);
    expect(curl.trainingMethods).toContain("superset");
    expect(pushdown.restSeconds).toBe(60);
  });

  it("E: preserves the full drop-set load sequence", () => {
    const lateralRaise = exercise(parse(WORKOUT_CAPTURE_FIXTURES.dropSet), "Lateral Raise");
    expect(lateralRaise.trainingMethods).toContain("drop_set");
    expect(lateralRaise.loadSteps?.map((step) => step.value)).toEqual([12, 10, 8, 6]);
    expect(lateralRaise.loadSteps?.map((step) => step.role)).toEqual(["top", "drop", "drop", "drop"]);
  });

  it("F: preserves bodyweight and per-set reps without kilograms", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.bodyweight);
    expect(exercise(draft, "Pull-Ups")).toMatchObject({ sets: 3, reps: "8, 7, 6", load: null });
    expect(exercise(draft, "Dips")).toMatchObject({ reps: "12, 10, 9", load: null, loadUnit: null, loadBasis: "bodyweight" });
  });

  it("G: treats assisted load as assistance", () => {
    expect(exercise(parse(WORKOUT_CAPTURE_FIXTURES.assisted), "Assisted Pull-Up")).toMatchObject({ load: 40, loadBasis: "assistance", sets: 3, reps: "10" });
  });

  it("H: preserves per-side loading", () => {
    expect(exercise(parse(WORKOUT_CAPTURE_FIXTURES.perSide), "Smith Squat")).toMatchObject({ load: 20, loadUnit: "kg", loadBasis: "per_side", sets: 4, reps: "8" });
  });

  it("I: preserves dumbbell each-hand semantics", () => {
    expect(exercise(parse(WORKOUT_CAPTURE_FIXTURES.dumbbell), "Dumbbell Shoulder")).toMatchObject({ load: 22.5, loadBasis: "per_hand", sets: 3, reps: "10" });
  });

  it("J: supports duration and rounds without forcing sets x reps", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.conditioning);
    expect(exercise(draft, "Treadmill")).toMatchObject({ durationMinutes: 15, sets: null });
    expect(exercise(draft, "Sled").sets).toBe(6);
    expect(exercise(draft, "Bike")).toMatchObject({ durationMinutes: 10, sets: null });
  });

  it("K: preserves circuit grouping, rounds, reps, load, and round rest", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.circuit);
    const swing = exercise(draft, "Kettlebell");
    const jump = exercise(draft, "Box Jump");
    const row = exercise(draft, "Calorie Row");
    expect(swing).toMatchObject({ groupRounds: 4, reps: "10", load: 24, restSeconds: 60 });
    expect(jump.supersetGroup).toBe(swing.supersetGroup);
    expect(row.reps).toBe("15 calories");
  });

  it("L: keeps AMRAP duration out of exercise set counts", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.amrap);
    expect(draft.exercises).toHaveLength(3);
    expect(draft.exercises.every((item) => item.trainingMethods?.includes("amrap"))).toBe(true);
    expect(draft.exercises.map((item) => item.sets)).toEqual([null, null, null]);
    expect(draft.exercises.map((item) => item.reps)).toEqual(["5", "10", "15"]);
  });

  it("M: stores RIR independently from reps", () => {
    expect(exercise(parse(WORKOUT_CAPTURE_FIXTURES.rir), "Bench")).toMatchObject({ load: 80, sets: 3, reps: "6", rir: 2 });
  });

  it("N: extracts incomplete work while leaving unknown values null", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.incomplete);
    expect(exercise(draft, "Incline Press")).toMatchObject({ sets: 4, reps: null, load: null, needsConfirmation: true });
    expect(exercise(draft, "Flyes")).toMatchObject({ sets: null, reps: null, load: null });
    expect(exercise(draft, "Push-Ups")).toMatchObject({ sets: null, reps: null, load: null });
  });

  it("O: preserves ambiguity instead of false precision", () => {
    const legPress = exercise(parse(WORKOUT_CAPTURE_FIXTURES.ambiguous), "Leg Press");
    expect(legPress).toMatchObject({ load: 180, reps: "10", sets: null, needsConfirmation: true });
    expect(legPress.uncertainFields).toEqual(expect.arrayContaining(["sets", "reps", "load"]));
  });

  it("P: uses the user's final corrected load", () => {
    const pulldown = exercise(parse(WORKOUT_CAPTURE_FIXTURES.correction), "Lat Pulldown");
    expect(pulldown.load).toBe(55);
    expect(pulldown.workingLoad).toBe(55);
    expect(pulldown.loadSteps?.map((step) => step.value)).toEqual([50, 55]);
  });

  it("Q: preserves mixed units independently", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.mixedUnits);
    expect(exercise(draft, "Bench")).toMatchObject({ load: 135, loadUnit: "lb" });
    expect(exercise(draft, "Cable Curl")).toMatchObject({ load: 12.5, loadUnit: "kg" });
  });

  it("R: accepts a named workout with no fabricated numbers", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.noNumbers);
    expect(draft.exercises).toHaveLength(4);
    expect(draft.exercises.every((item) => item.sets === null && item.reps === null && item.load === null)).toBe(true);
  });

  it("S: tolerates punctuation-free mobile dictation", () => {
    const draft = parse(WORKOUT_CAPTURE_FIXTURES.messyDictation);
    expect(exercise(draft, "Bench").loadSteps?.map((step) => [step.value, step.reps])).toEqual([[60, "10"], [70, "8"], [80, "6"]]);
    expect(exercise(draft, "Incline Dumbbell")).toMatchObject({ load: 20, sets: 3, reps: "10" });
    expect(exercise(draft, "Pec Deck")).toMatchObject({ sets: 7, reps: "12", restStyle: "short rest" });
  });

  it("T: ignores clock time and machine-wait time", () => {
    const bench = exercise(parse(WORKOUT_CAPTURE_FIXTURES.nonWorkoutNumbers), "Bench");
    expect(bench).toMatchObject({ load: 60, sets: 3, reps: "10", durationMinutes: null });
    expect(bench.loadSteps?.some((step) => step.value === 7 || step.value === 15)).toBe(false);
  });

  it.each([
    ["Cable flyes\nfelt good", { sets: 3, reps: "12", load: 10, loadUnit: "kg" }],
    ["Squats\nheavy today", { sets: 4, reps: "8", load: 100, loadUnit: "kg" }],
    ["Bench\n3 sets", { sets: 3, reps: "10", load: 60, loadUnit: "kg" }]
  ])("strips unsupported AI numbers from %s", (input, invented) => {
    const raw = JSON.stringify({
      title: "Workout",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: 45,
      confidence: 0.95,
      uncertainties: [],
      exercises: [{
        name: input.split("\n")[0],
        originalText: input,
        ...invented,
        durationMinutes: null,
        restSeconds: null,
        note: null,
        movementPattern: "other",
        confidence: 0.95,
        needsConfirmation: false
      }]
    });
    const parsed = normalizeWorkoutCaptureResponse(raw, input, "text");
    const item = parsed.exercises[0];
    expect(item.load).toBeNull();
    expect(item.reps).toBeNull();
    expect(item.sets).toBe(input.includes("3 sets") ? 3 : null);
    expect(parsed.durationMinutes).toBeNull();
  });

  it("does not validate invented reps merely because the number appears as a load", () => {
    const parsed = normalizeWorkoutCaptureResponse(JSON.stringify({
      title: "Bench",
      workoutType: "Strength",
      difficulty: "moderate",
      durationMinutes: null,
      confidence: 0.9,
      uncertainties: [],
      exercises: [{
        name: "Bench Press",
        originalText: "Bench press 60kg, 3 sets",
        sets: 3,
        reps: "60",
        load: 60,
        loadUnit: "kg",
        durationMinutes: null,
        restSeconds: null,
        note: null,
        movementPattern: "push",
        confidence: 0.9,
        needsConfirmation: false
      }]
    }), "Bench press 60kg, 3 sets", "text");

    expect(parsed.exercises[0]).toMatchObject({ sets: 3, reps: null, load: 60 });
  });
});
