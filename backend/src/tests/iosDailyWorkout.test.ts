import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/aiWorkLeaseService", () => ({
  withAiWorkLease: (_key: string, work: () => Promise<unknown>) => work(),
  assertAiWorkOwnership: async () => undefined
}));

const { dbQuery, clientQuery, release, withClient } = vi.hoisted(() => ({
  dbQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn(),
  withClient: vi.fn((_client, work) => work())
}));
vi.mock("../db/pool", () => ({
  query: dbQuery, withQueryClient: withClient,
  pool: { connect: async () => ({ query: clientQuery, release }) }
}));
import { generateIosDailyWorkout, getIosDailyWorkout, getIosWorkoutForCompletion, swapIosDailyWorkoutExercise } from "../services/iosDailyWorkoutService";
import type { CoachWorkoutPlan } from "../integrations/openai";

const now = new Date("2026-09-23T15:30:00Z");
const workout: CoachWorkoutPlan = {
  title: "Easy home session", intro: "A gentle session for today.", estimatedDurationMinutes: 20,
  focus: "General Fitness", intensity: "easy", warmup: ["Walk gently"],
  exercises: [{ name: "Chair squat", sets: 2, reps: "8" }], cooldown: ["Walk gently"],
  coachTip: "Move at your own pace.", disclaimer: "Stop if you experience pain."
};
const request = { location: "home", timeAvailable: "20", goal: "general_fitness", equipment: "Bodyweight" } as const;
const saved = { completion_key: "saved-key", request, workout, resets_at: "2026-09-23T16:00:00Z", completed: true };
function input(generate = vi.fn(async () => workout)) {
  return { userId: "member", timezoneOffsetMinutes: -480, request, generate };
}
beforeEach(() => {
  vi.clearAllMocks();
  dbQuery.mockReset();
  clientQuery.mockReset().mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try_advisory") ? [{ locked: true }] : [] }));
});

describe("native daily workout allowance", () => {
  it("commits the generated plan and usage together, resetting at local midnight", async () => {
    const args = input();
    const result = await generateIosDailyWorkout(args, now);
    expect(result).toMatchObject({ workout, request, completed: false, resetsAt: "2026-09-23T16:00:00.000Z" });
    expect(withClient).not.toHaveBeenCalled();
    const writes = clientQuery.mock.calls.filter(([sql]) => sql.startsWith("insert"));
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual([result.workoutCompletionKey, "member", request, workout, now.toISOString(), result.resetsAt]);
    expect(writes[1][1].at(-1)).toMatchObject({ feature: "coach_zoe_workout_planner", edition: "ios" });
    expect(clientQuery.mock.calls.at(-1)).toEqual(["commit"]);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("reuses today's plan even if equipment or device timezone changes", async () => {
    clientQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try_advisory") ? [{ locked: true }] : sql.includes("from ios_daily_workouts") ? [saved] : [] }));
    const args = { ...input(), timezoneOffsetMinutes: 480, request: { ...request, equipment: "Dumbbells" } };
    expect(await generateIosDailyWorkout(args, now)).toMatchObject({ workoutCompletionKey: "saved-key", request, completed: true });
    expect(args.generate).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
  });

  it("rejects a concurrent generation before calling AI", async () => {
    clientQuery.mockResolvedValue({ rows: [{ locked: false }] });
    const args = input();
    await expect(generateIosDailyWorkout(args, now)).rejects.toMatchObject({ status: 409 });
    expect(args.generate).not.toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith("rollback");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not consume the allowance on failure and allows a retry", async () => {
    const args = input(vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce(workout));
    await expect(generateIosDailyWorkout(args, now)).rejects.toThrow("provider unavailable");
    expect(clientQuery.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
    expect(release).toHaveBeenCalled();
    await expect(generateIosDailyWorkout(args, now)).resolves.toMatchObject({ workout });
  });

  it("rolls back the plan if recording usage fails", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("insert into ai_usage_events")) throw new Error("storage error");
      return { rows: sql.includes("pg_try_advisory") ? [{ locked: true }] : [] };
    });
    await expect(generateIosDailyWorkout(input(), now)).rejects.toThrow("storage error");
    expect(clientQuery).toHaveBeenCalledWith("rollback");
    expect(clientQuery.mock.calls.filter(([sql]) => sql === "commit")).toHaveLength(1);
  });

  it("releases the preflight connection before waiting for the provider", async () => {
    await generateIosDailyWorkout(input(vi.fn(async () => {
      expect(release).toHaveBeenCalledOnce();
      expect(clientQuery.mock.calls.at(-1)).toEqual(["commit"]);
      return workout;
    })), now);
  });

  it("reads the persisted completion state and scopes completion lookup to the account", async () => {
    dbQuery.mockResolvedValue({ rows: [saved] });
    expect(await getIosDailyWorkout("member", now)).toMatchObject({ completed: true, workoutCompletionKey: "saved-key" });
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("w.resets_at > $2"), ["member", now.toISOString()]);
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await getIosWorkoutForCompletion("other-member", "saved-key")).toBeNull();
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("w.user_id = $1 and w.completion_key = $2"), ["other-member", "saved-key"]);
  });

  it("returns the actual checked indexes when a partial daily workout is reopened", async () => {
    dbQuery.mockResolvedValue({ rows: [{ ...saved, workout: { ...workout, exercises: [
      { name: "Bodyweight Squat" }, { name: "Dumbbell Row" }
    ] }, completed_exercise_indexes: [1] }] });
    expect(await getIosDailyWorkout("member", now)).toMatchObject({ completed: true, completedExerciseIndexes: [1] });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("completedExerciseIndexes"), ["member", now.toISOString()]);
  });

  it("starts a new allowance at midnight", async () => {
    const result = await generateIosDailyWorkout(input(), new Date("2026-09-23T16:00:00Z"));
    expect(result.resetsAt).toBe("2026-09-24T16:00:00.000Z");
  });

  it("saves an account-owned exercise swap without another AI call", async () => {
    const v2 = { ...workout, experienceVersion: 2 as const, exercises: [{
      name: "Bodyweight Squat", sets: 2, reps: "10", alternatives: [{ name: "Chair Squat", sets: 2, reps: "8", note: "Use a sturdy chair." }]
    }] };
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("from ios_daily_workouts")) return { rows: [{ ...saved, workout: v2 }], rowCount: 1 };
      if (sql.includes("from analytics_events")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    const result = await swapIosDailyWorkoutExercise("member", "saved-key", 0);
    expect(result.workout.exercises[0]).toMatchObject({ name: "Chair Squat", reps: "8" });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("update ios_daily_workouts"), ["member", "saved-key", result.workout]);
    expect(clientQuery.mock.calls.at(-1)).toEqual(["commit"]);
  });

  it("does not swap an older workout when the route accepts saved workout requests", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("from ios_daily_workouts")) return { rows: [{ ...saved, completed: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(swapIosDailyWorkoutExercise("member", "saved-key", 0)).rejects.toMatchObject({ status: 400 });
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("update ios_daily_workouts"))).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("rollback");
  });

  it("does not swap a completed V2 workout", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("from ios_daily_workouts")) return { rows: [{ ...saved, workout: { ...workout, experienceVersion: 2 } }], rowCount: 1 };
      if (sql.includes("from analytics_events")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(swapIosDailyWorkoutExercise("member", "saved-key", 0)).rejects.toMatchObject({ status: 409 });
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("update ios_daily_workouts"))).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("rollback");
  });
});
