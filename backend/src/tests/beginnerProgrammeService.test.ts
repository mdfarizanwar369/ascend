import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeginnerProgrammePrescription } from "@ascend/shared";

const mocks = vi.hoisted(() => ({ query: vi.fn(), lease: vi.fn(), fencedTransaction: vi.fn() }));
vi.mock("../db/pool", () => ({ query: mocks.query, pool: {}, withQueryClient: vi.fn() }));
vi.mock("../services/aiWorkLeaseService", () => ({
  withAiWorkLease: mocks.lease, withAiWorkTransaction: mocks.fencedTransaction, assertAiWorkOwnership: vi.fn()
}));
vi.mock("../config/env", () => ({ env: { AI_PROVIDER: "gemini", GEMINI_MODEL: "test", AI_CHAT_ESTIMATED_COST_CENTS: 1 } }));

import { beginnerProgrammeCompletionQualifies, beginnerProgrammeStage, getBeginnerProgrammeWorkoutForCompletion, withBeginnerProgrammeCompletion } from "../services/beginnerProgrammeService";
import type { CoachWorkoutPlan } from "../integrations/openai";

const prescription: BeginnerProgrammePrescription = {
  programmeId: "programme", sessionNumber: 1, sessionKind: "A", stage: "foundation", stageLabel: "Getting comfortable",
  note: "Start comfortably", coreExerciseIndexes: [0, 1, 2], supplementary: false
};
const workout: CoachWorkoutPlan & { beginnerProgramme: BeginnerProgrammePrescription } = {
  title: "Simple strength", intro: "Test", focus: "Full body strength", intensity: "easy", estimatedDurationMinutes: 20,
  warmup: [], cooldown: [], coachTip: "Test", disclaimer: "Test", exercises: [
    { name: "Bodyweight Squat", reps: "8" }, { name: "Wall Push-Up", reps: "8" }, { name: "Dumbbell Row", reps: "8" },
    { name: "Easy Walk", duration: "5 min" }
  ], beginnerProgramme: prescription
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.lease.mockImplementation((_resource, work) => work());
  mocks.fencedTransaction.mockImplementation(work => work());
});

describe("beginner programme progression boundaries", () => {
  it.each([[0, "foundation"], [2, "foundation"], [3, "consistency"], [7, "consistency"], [8, "progress"], [12, "progress"], [24, "progress"]])(
    "keeps completed session count %s in %s", (completed, stage) => {
      expect(beginnerProgrammeStage(Number(completed)).stage).toBe(stage);
    }
  );

  it("requires all prescribed core movements rather than every optional activity", () => {
    expect(beginnerProgrammeCompletionQualifies(workout, { completedExerciseIndexes: [0, 1], completionStatus: "partial" })).toBe(false);
    expect(beginnerProgrammeCompletionQualifies(workout, { completedExerciseIndexes: [0, 1, 2], completionStatus: "partial" })).toBe(true);
    expect(beginnerProgrammeCompletionQualifies(workout, { completedExerciseIndexes: [0, 1, 2, 3] })).toBe(true);
    expect(beginnerProgrammeCompletionQualifies(workout, { completedExerciseIndexes: [] })).toBe(false);
  });

  it("does not assume full completion from ambiguous partial metadata", () => {
    expect(beginnerProgrammeCompletionQualifies(workout, { completionStatus: "partial" })).toBe(false);
    expect(beginnerProgrammeCompletionQualifies(workout, {})).toBe(true);
  });

  it("does not award strength progression to recovery, invalid or absent prescriptions", () => {
    expect(beginnerProgrammeCompletionQualifies({ ...workout, beginnerProgramme: { ...prescription, supplementary: true } }, {})).toBe(false);
    expect(beginnerProgrammeCompletionQualifies({ ...workout, beginnerProgramme: { ...prescription, coreExerciseIndexes: [] } }, {})).toBe(false);
    expect(beginnerProgrammeCompletionQualifies({ ...workout, beginnerProgramme: { ...prescription, coreExerciseIndexes: [99] } }, {})).toBe(false);
    expect(beginnerProgrammeCompletionQualifies({ ...workout, beginnerProgramme: undefined }, {})).toBe(false);
  });

  it("scopes completion lookups to the authenticated account and exact key", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    expect(await getBeginnerProgrammeWorkoutForCompletion("other-user", "known-key")).toBeNull();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("s.user_id=$1 and s.completion_key=$2"), ["other-user", "known-key"]);
  });

  it("never invokes the save callback for another account's or dismissed prescription", async () => {
    const save = vi.fn();
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(withBeginnerProgrammeCompletion("other-user", "known-key", save)).rejects.toMatchObject({ status: 404 });
    mocks.query.mockResolvedValueOnce({ rows: [{ outcome: "dismissed" }] });
    await expect(withBeginnerProgrammeCompletion("owner", "known-key", save)).rejects.toMatchObject({ status: 409 });
    expect(save).not.toHaveBeenCalled();
  });

  it("fences the save and reconciliation in the same transaction and resource lease", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ outcome: "open" }] }).mockResolvedValueOnce({ rows: [] });
    const save = vi.fn(async () => ({ saved: true }));
    expect(await withBeginnerProgrammeCompletion("owner", "known-key", save)).toEqual({ saved: true });
    expect(mocks.lease).toHaveBeenCalledWith("ios-daily-workout:owner", expect.any(Function));
    expect(mocks.fencedTransaction).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("s.outcome <> 'dismissed'"), ["owner"]);
  });

  it("rejects a changed exercise or credit prescription after the route reads the plan", async () => {
    const save = vi.fn();
    mocks.query.mockResolvedValueOnce({ rows: [{ outcome: "open", workout: { ...workout,
      exercises: [{ ...workout.exercises[0], name: "Reverse Lunge" }, ...workout.exercises.slice(1)] } }] });
    await expect(withBeginnerProgrammeCompletion("owner", "known-key", save, workout)).rejects.toMatchObject({ status: 409 });
    mocks.query.mockResolvedValueOnce({ rows: [{ outcome: "open", workout: { ...workout,
      beginnerProgramme: { ...prescription, coreExerciseIndexes: [0, 1] } } }] });
    await expect(withBeginnerProgrammeCompletion("owner", "known-key", save, workout)).rejects.toMatchObject({ status: 409 });
    expect(save).not.toHaveBeenCalled();
  });

  it("allows the identical canonical plan when read-time swap alternatives differ", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ outcome: "open", workout }] }).mockResolvedValueOnce({ rows: [] });
    const save = vi.fn(async () => ({ saved: true }));
    const viewed = { ...workout, exercises: workout.exercises.map(exercise => ({ ...exercise, alternatives: [{ name: "Another safe option" }] })) };
    expect(await withBeginnerProgrammeCompletion("owner", "known-key", save, viewed)).toEqual({ saved: true });
    expect(save).toHaveBeenCalledOnce();
  });
});
