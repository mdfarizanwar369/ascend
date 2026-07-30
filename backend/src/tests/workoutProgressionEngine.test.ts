import { describe, expect, it } from "vitest";
import {
  buildWorkoutProgression,
  canonicalExerciseName,
  progressionWorkoutFromMetadata,
  totalRecordedReps,
  workoutEvidenceTypeForSource,
  type ProgressionWorkoutInput
} from "../services/workoutProgressionEngine";

function workout(
  id: string,
  exercises: ProgressionWorkoutInput["exercises"],
  overrides: Partial<ProgressionWorkoutInput> = {}
): ProgressionWorkoutInput {
  return {
    id,
    completedAt: id === "current" ? "2026-07-30T10:00:00.000Z" : "2026-07-28T10:00:00.000Z",
    evidenceType: "observed_performance",
    exercises,
    ...overrides
  };
}

describe("workout progression engine", () => {
  it("creates a baseline for the first observed detailed workout", () => {
    const result = buildWorkoutProgression(workout("current", [{ name: "Bench Press", sets: 3, reps: "10", load: 50, loadUnit: "kg" }]), []);
    expect(result?.overallStatus).toBe("baseline");
    expect(result?.comparisons[0]).toMatchObject({ status: "baseline", reason: "first_observation" });
  });

  it("excludes completed plans and simple activity from progression", () => {
    const exercise = [{ name: "Squat", sets: 3, reps: "8", load: 60, loadUnit: "kg" as const }];
    expect(buildWorkoutProgression(workout("current", exercise, { evidenceType: "completed_plan" }), [])).toBeNull();
    expect(buildWorkoutProgression(workout("current", exercise, { evidenceType: "simple_activity" }), [])).toBeNull();
  });

  it("maps only captured and trainer-led sessions to observed performance", () => {
    expect(workoutEvidenceTypeForSource("ai_workout_capture")).toBe("observed_performance");
    expect(workoutEvidenceTypeForSource("trainer_logged_session")).toBe("observed_performance");
    expect(workoutEvidenceTypeForSource("coach_zoe_workout_planner")).toBe("completed_plan");
    expect(workoutEvidenceTypeForSource("coach_homework")).toBe("completed_plan");
    expect(workoutEvidenceTypeForSource("manual")).toBe("simple_activity");
  });

  it("verifies higher load only when repetitions remain comparable", () => {
    const previous = workout("previous", [{ name: "Bench Press", sets: 3, reps: "10", load: 50, loadUnit: "kg" }]);
    const progressed = buildWorkoutProgression(
      workout("current", [{ name: "Bench Press", sets: 3, reps: "10", load: 55, loadUnit: "kg" }]),
      [previous]
    );
    expect(progressed?.comparisons[0]).toMatchObject({ status: "progressed", reason: "higher_load" });

    const repDrop = buildWorkoutProgression(
      workout("current", [{ name: "Bench Press", sets: 3, reps: "5", load: 55, loadUnit: "kg" }]),
      [previous]
    );
    expect(repDrop?.comparisons[0]).toMatchObject({ status: "changed", reason: "mixed_change" });
    expect(repDrop?.headline).not.toContain("progression");
  });

  it("verifies more total reps at the same load", () => {
    const result = buildWorkoutProgression(
      workout("current", [{ name: "Dumbbell Row", sets: 3, reps: "10,10,10", load: 20, loadUnit: "kg" }]),
      [workout("previous", [{ name: "DB Row", sets: 3, reps: "10,8,8", load: 20, loadUnit: "kg" }])]
    );
    expect(result?.comparisons[0]).toMatchObject({ status: "progressed", reason: "more_reps" });
    expect(result?.highlights[0]).toContain("26 to 30");
  });

  it("records lower load and fewer reps neutrally without calling them decline", () => {
    const result = buildWorkoutProgression(
      workout("current", [{ name: "Deadlift", sets: 3, reps: "6", load: 70, loadUnit: "kg" }]),
      [workout("previous", [{ name: "Deadlift", sets: 3, reps: "8", load: 80, loadUnit: "kg" }])]
    );
    expect(result?.comparisons[0]).toMatchObject({ status: "changed", reason: "lower_load" });
    expect(JSON.stringify(result)).not.toMatch(/declin|failed|worse/i);
  });

  it("does not compare rep ranges, mismatched units, or loaded versus unweighted work", () => {
    expect(totalRecordedReps("10-12", 3)).toBeNull();
    expect(totalRecordedReps("8\u201310", 3)).toBeNull();
    const previous = workout("previous", [{ name: "Squat", sets: 3, reps: "10-12", load: 50, loadUnit: "kg" }]);
    const rangeResult = buildWorkoutProgression(workout("current", [{ name: "Squat", sets: 3, reps: "12-15", load: 50, loadUnit: "kg" }]), [previous]);
    expect(rangeResult?.comparisons[0].status).toBe("not_comparable");

    const unitResult = buildWorkoutProgression(
      workout("current", [{ name: "Squat", sets: 3, reps: "10", load: 110, loadUnit: "lb" }]),
      [workout("previous", [{ name: "Squat", sets: 3, reps: "10", load: 50, loadUnit: "kg" }])]
    );
    expect(unitResult?.comparisons[0]).toMatchObject({ status: "not_comparable", reason: "unit_mismatch" });

    const loadingResult = buildWorkoutProgression(
      workout("current", [{ name: "Squat", sets: 3, reps: "10", load: null, loadUnit: null }]),
      [workout("previous", [{ name: "Squat", sets: 3, reps: "10", load: 50, loadUnit: "kg" }])]
    );
    expect(loadingResult?.comparisons[0].status).toBe("not_comparable");
  });

  it("matches safe abbreviations but not fuzzy exercise names", () => {
    expect(canonicalExerciseName("DB Shoulder Press")).toBe("dumbbell shoulder press");
    expect(canonicalExerciseName("BB Curl")).toBe("barbell curl");
    const result = buildWorkoutProgression(
      workout("current", [{ name: "Incline Bench Press", sets: 3, reps: "10", load: 50, loadUnit: "kg" }]),
      [workout("previous", [{ name: "Bench Press", sets: 3, reps: "10", load: 45, loadUnit: "kg" }])]
    );
    expect(result?.comparisons[0].status).toBe("baseline");
  });

  it("uses the most recent observed occurrence and ignores completed plans", () => {
    const result = buildWorkoutProgression(
      workout("current", [{ name: "Bench Press", sets: 3, reps: "10", load: 55, loadUnit: "kg" }]),
      [
        workout("generated", [{ name: "Bench Press", sets: 3, reps: "10", load: 80, loadUnit: "kg" }], {
          completedAt: "2026-07-29T10:00:00.000Z",
          evidenceType: "completed_plan"
        }),
        workout("recent-observed", [{ name: "Bench Press", sets: 3, reps: "10", load: 52.5, loadUnit: "kg" }], {
          completedAt: "2026-07-28T10:00:00.000Z"
        }),
        workout("older-observed", [{ name: "Bench Press", sets: 3, reps: "10", load: 45, loadUnit: "kg" }], {
          completedAt: "2026-07-20T10:00:00.000Z"
        })
      ]
    );
    expect(result?.comparisons[0].previousWorkoutId).toBe("recent-observed");
    expect(result?.highlights[0]).toContain("52.5kg to 55kg");
  });

  it("infers evidence for historical metadata and preserves confidence safely", () => {
    const parsed = progressionWorkoutFromMetadata({
      id: "event-1",
      createdAt: "2026-07-20T10:00:00.000Z",
      metadata: {
        source: "trainer_logged_session",
        exercises: [{ name: "Press", sets: 3, reps: "8", load: 40, loadUnit: "kg", confidence: 2 }]
      }
    });
    expect(parsed?.evidenceType).toBe("observed_performance");
    const result = buildWorkoutProgression(workout("current", [{ name: "Press", sets: 3, reps: "8", load: 42.5, loadUnit: "kg", confidence: -1 }]), parsed ? [parsed] : []);
    expect(result?.confidence).toBe(0);
  });

  it("does not mutate workout history or expose unrelated metadata", () => {
    const history = [workout("previous", [{ name: "Press", sets: 3, reps: "8", load: 40, loadUnit: "kg" }])];
    const before = JSON.stringify(history);
    const result = buildWorkoutProgression(workout("current", [{ name: "Press", sets: 3, reps: "8", load: 42.5, loadUnit: "kg" }]), history);
    expect(JSON.stringify(history)).toBe(before);
    expect(result).not.toHaveProperty("rawInput");
    expect(JSON.stringify(result)).not.toContain("trainerNextSessionNote");
  });
});
