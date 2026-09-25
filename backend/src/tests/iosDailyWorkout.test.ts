import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery, clientQuery, release, withClient } = vi.hoisted(() => ({
  dbQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn(),
  withClient: vi.fn((_client, work) => work())
}));
vi.mock("../db/pool", () => ({
  query: dbQuery, withQueryClient: withClient,
  pool: { connect: async () => ({ query: clientQuery, release }) }
}));
import { generateIosDailyWorkout, getIosDailyWorkout, getIosWorkoutForCompletion } from "../services/iosDailyWorkoutService";
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
    expect(withClient).toHaveBeenCalledWith(expect.anything(), args.generate);
    const writes = clientQuery.mock.calls.filter(([sql]) => sql.startsWith("insert"));
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual([result.workoutCompletionKey, "member", request, workout, now.toISOString(), result.resetsAt]);
    expect(writes[1][1].at(-1)).toMatchObject({ feature: "coach_zoe_workout_planner", edition: "ios" });
    expect(clientQuery.mock.calls.at(-1)).toEqual(["commit"]);
    expect(release).toHaveBeenCalledOnce();
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
    expect(clientQuery).toHaveBeenCalledWith("rollback");
    await expect(generateIosDailyWorkout(args, now)).resolves.toMatchObject({ workout });
  });

  it("rolls back the plan if recording usage fails", async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("insert into ai_usage_events")) throw new Error("storage error");
      return { rows: sql.includes("pg_try_advisory") ? [{ locked: true }] : [] };
    });
    await expect(generateIosDailyWorkout(input(), now)).rejects.toThrow("storage error");
    expect(clientQuery).toHaveBeenCalledWith("rollback");
    expect(clientQuery).not.toHaveBeenCalledWith("commit");
  });

  it("reads the persisted completion state and scopes completion lookup to the account", async () => {
    dbQuery.mockResolvedValue({ rows: [saved] });
    expect(await getIosDailyWorkout("member", now)).toMatchObject({ completed: true, workoutCompletionKey: "saved-key" });
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("w.resets_at > $2"), ["member", now.toISOString()]);
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await getIosWorkoutForCompletion("other-member", "saved-key")).toBeNull();
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("w.user_id = $1 and w.completion_key = $2"), ["other-member", "saved-key"]);
  });

  it("starts a new allowance at midnight", async () => {
    const result = await generateIosDailyWorkout(input(), new Date("2026-09-23T16:00:00Z"));
    expect(result.resetsAt).toBe("2026-09-24T16:00:00.000Z");
  });
});
