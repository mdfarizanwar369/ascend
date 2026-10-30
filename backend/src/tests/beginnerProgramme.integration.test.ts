import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CoachWorkoutPlan } from "../integrations/openai";

const testUrl = process.env.ASCEND_HARDENING_TEST_DATABASE_URL;
const users: string[] = [];
let db: typeof import("../db/pool");
let programme: typeof import("../services/beginnerProgrammeService");
const request = { location: "gym", equipment: "Full Gym", goal: "general_fitness", timeAvailable: "30" } as const;
const fixture: CoachWorkoutPlan = {
  title: "Programme test fixture", intro: "Test only", focus: "Full body strength", intensity: "easy", estimatedDurationMinutes: 30,
  experienceVersion: 2, warmup: ["Walk gently"], cooldown: ["Walk gently"], coachTip: "Test", disclaimer: "Test fixture",
  exercises: [{ name: "Seated Leg Press", sets: 2, reps: "8" }, { name: "Machine Chest Press", sets: 2, reps: "8" },
    { name: "Seated Cable Row", sets: 2, reps: "8" }, { name: "Easy Walk", duration: "5 min" }]
};
const atDay = (day: number) => new Date(Date.UTC(2026, 9, day, 4));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function user() {
  const id = randomUUID(); users.push(id);
  await db.query("insert into users(id,firebase_uid,email,full_name) values($1,$2,$3,'Programme fixture')", [id, `test-${id}`, `${id}@example.invalid`]);
  return id;
}
async function generate(userId: string, now = atDay(1), workout: CoachWorkoutPlan = fixture) {
  return programme.generateBeginnerProgrammeWorkout({ userId, request, timezoneOffsetMinutes: -480,
    recordUsage: false, generate: async () => workout }, now);
}
async function event(userId: string, key: string, indexes: number[], now: Date, failure = false) {
  return programme.withBeginnerProgrammeCompletion(userId, key, async () => {
    const existing = await db.query<{ id: string }>("select id from analytics_events where user_id=$1 and event_name='burn_log' and metadata->>'workoutCompletionKey'=$2", [userId, key]);
    if (existing.rows[0]) return existing.rows[0];
    const saved = await db.query<{ id: string }>(`insert into analytics_events(user_id,event_name,metadata,created_at)
      values($1,'burn_log',$2,$3) returning id`, [userId, { workoutCompletionKey: key, source: "coach_zoe_workout_planner",
      completedExerciseIndexes: indexes, completionStatus: indexes.length === fixture.exercises.length ? "complete" : "partial" }, now.toISOString()]);
    if (failure) throw new Error("Intentional save failure");
    return saved.rows[0];
  });
}

describe.skipIf(!testUrl)("beginner programme with isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_hardening_test") throw new Error("Only the isolated local hardening test database is allowed");
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_POOL_MAX", "2");
    vi.stubEnv("DATABASE_CONNECT_TIMEOUT_MS", "1000");
    db = await import("../db/pool");
    programme = await import("../services/beginnerProgrammeService");
  });
  afterAll(async () => {
    if (db) {
      await db.query("delete from analytics_events where user_id=any($1::uuid[])", [users]);
      await db.query("delete from ai_usage_events where user_id=any($1::uuid[])", [users]);
      await db.query("delete from users where id=any($1::uuid[])", [users]);
      await db.pool.end();
    }
    vi.unstubAllEnvs();
  });

  it("does not enroll or create prescriptions on ordinary reads", async () => {
    const userId = await user();
    expect(await programme.getBeginnerProgramme(userId)).toBeNull();
    expect(await programme.getBeginnerProgrammeWorkout(userId)).toBeNull();
    expect(Number((await db.query("select count(*) from zoe_beginner_programmes where user_id=$1", [userId])).rows[0].count)).toBe(0);
  });

  it("persists an unfinished prescription through midnight, timezone changes and pauses", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const original = await generate(userId);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    expect(await programme.getBeginnerProgrammeWorkout(userId, atDay(9), 480)).toMatchObject({ workoutCompletionKey: original.workoutCompletionKey, completed: false });
    await programme.setBeginnerProgrammeStatus(userId, "pause");
    expect(await programme.getBeginnerProgrammeWorkout(userId, atDay(9), -480)).toMatchObject({ workoutCompletionKey: original.workoutCompletionKey });
    await programme.setBeginnerProgrammeStatus(userId, "resume");
    const generateAgain = vi.fn(async () => fixture);
    const reopened = await programme.generateBeginnerProgrammeWorkout({ userId, request: { ...request, location: "hotel", equipment: "Bodyweight" },
      timezoneOffsetMinutes: 480, generate: generateAgain, recordUsage: false }, atDay(9));
    expect(reopened.request).toEqual(request);
    expect(reopened.workoutCompletionKey).toBe(original.workoutCompletionKey);
    expect(generateAgain).not.toHaveBeenCalled();
  });

  it("completes twelve sessions in sequence, retaining actual credits beyond twelve", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    for (let completed = 0; completed < 12; completed++) {
      const now = atDay(1 + completed * 2);
      const session = await generate(userId, now);
      expect(session.workout.beginnerProgramme).toMatchObject({ sessionNumber: completed + 1, sessionKind: completed % 2 ? "B" : "A" });
      const saved = await event(userId, session.workoutCompletionKey, [0, 1, 2], now);
      expect(await event(userId, session.workoutCompletionKey, [0, 1, 2], now)).toEqual(saved);
      expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(completed + 1);
    }
    expect(await programme.getBeginnerProgramme(userId)).toMatchObject({ completedSessions: 12, nextSessionNumber: 13, stage: "progress" });
    expect(Number((await db.query("select count(*) from analytics_events where user_id=$1 and event_name='burn_log'", [userId])).rows[0].count)).toBe(12);
  });

  it("does not advance for insufficient partial completion, recovery or dismissal", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const partial = await generate(userId);
    await event(userId, partial.workoutCompletionKey, [0, 1], atDay(1));
    expect((await programme.getBeginnerProgramme(userId))?.nextSessionNumber).toBe(1);
    const recovery = await generate(userId, atDay(2), { ...fixture, focus: "Recovery and mobility" });
    await event(userId, recovery.workoutCompletionKey, [0, 1, 2, 3], atDay(2));
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    const dismissed = await generate(userId, atDay(3));
    await programme.dismissBeginnerProgrammeWorkout(userId, dismissed.workoutCompletionKey);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    await expect(event(userId, dismissed.workoutCompletionKey, [0, 1, 2, 3], atDay(3))).rejects.toMatchObject({ status: 409 });
  });

  it("rolls back the activity and programme together when saving fails", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const session = await generate(userId);
    await expect(event(userId, session.workoutCompletionKey, [0, 1, 2], atDay(1), true)).rejects.toThrow("Intentional save failure");
    expect(Number((await db.query("select count(*) from analytics_events where user_id=$1", [userId])).rows[0].count)).toBe(0);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    expect(await programme.getBeginnerProgrammeWorkout(userId)).toMatchObject({ completed: false, workoutCompletionKey: session.workoutCompletionKey });
    await event(userId, session.workoutCompletionKey, [0, 1, 2], atDay(1));
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(1);
  });

  it("deleting the linked activity removes credit without deleting programme history", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const session = await generate(userId);
    const saved = await event(userId, session.workoutCompletionKey, [0, 1, 2], atDay(1));
    await db.query("delete from analytics_events where user_id=$1 and id=$2", [userId, saved.id]);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    expect(Number((await db.query("select count(*) from zoe_beginner_programme_sessions where user_id=$1", [userId])).rows[0].count)).toBe(1);
  });

  it("rejects cross-account completion, swapping and dismissal", async () => {
    const owner = await user(), other = await user();
    await programme.setBeginnerProgrammeStatus(owner, "start");
    const session = await generate(owner);
    expect(await programme.getBeginnerProgrammeWorkoutForCompletion(other, session.workoutCompletionKey)).toBeNull();
    const save = vi.fn();
    await expect(programme.withBeginnerProgrammeCompletion(other, session.workoutCompletionKey, save)).rejects.toMatchObject({ status: 404 });
    await expect(programme.swapBeginnerProgrammeWorkoutExercise(other, session.workoutCompletionKey, 0)).rejects.toMatchObject({ status: 404 });
    await expect(programme.dismissBeginnerProgrammeWorkout(other, session.workoutCompletionKey)).rejects.toMatchObject({ status: 404 });
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps DB connections free while generation waits and prevents duplicate AI calls", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const unblock = deferred(); let started = false;
    const generateSlowly = vi.fn(async () => { started = true; await unblock.promise; return fixture; });
    const input = { userId, request, timezoneOffsetMinutes: -480, generate: generateSlowly, recordUsage: false };
    const pending = programme.generateBeginnerProgrammeWorkout(input, atDay(1));
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      expect(db.pool.waitingCount).toBe(0);
      expect((await db.query("select 1 as alive")).rows[0].alive).toBe(1);
      await expect(programme.generateBeginnerProgrammeWorkout(input, atDay(1))).rejects.toMatchObject({ name: "AiWorkBusyError" });
    } finally { unblock.resolve(); }
    await pending;
    expect(generateSlowly).toHaveBeenCalledOnce();
  });

  it("serializes concurrent completions and credits a retried request exactly once", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const session = await generate(userId);
    const unblock = deferred(); let started = false;
    const first = programme.withBeginnerProgrammeCompletion(userId, session.workoutCompletionKey, async () => {
      started = true; await unblock.promise;
      const saved = await db.query<{ id: string }>(`insert into analytics_events(user_id,event_name,metadata,created_at)
        values($1,'burn_log',$2,$3) returning id`, [userId, { source: "coach_zoe_workout_planner", workoutCompletionKey: session.workoutCompletionKey,
        completedExerciseIndexes: [0, 1, 2] }, atDay(1).toISOString()]);
      return saved.rows[0];
    });
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      await expect(event(userId, session.workoutCompletionKey, [0, 1, 2], atDay(1))).rejects.toMatchObject({ name: "AiWorkBusyError" });
    } finally { unblock.resolve(); }
    const saved = await first;
    expect(await event(userId, session.workoutCompletionKey, [0, 1, 2], atDay(1))).toEqual(saved);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(1);
    expect(Number((await db.query("select count(*) from analytics_events where user_id=$1 and event_name='burn_log'", [userId])).rows[0].count)).toBe(1);
  });

  it("rejects completion when a swap commits after the route read its prescription", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const original = await generate(userId);
    const viewed = await programme.getBeginnerProgrammeWorkoutForCompletion(userId, original.workoutCompletionKey);
    // Reproduces the request race: route validation read, concurrent swap, then
    // the completion request obtains its lease and must recheck that snapshot.
    const swapped = await programme.swapBeginnerProgrammeWorkoutExercise(userId, original.workoutCompletionKey, 0);
    expect(swapped.workout.exercises[0].name).not.toBe(viewed!.workout.exercises[0].name);
    const save = vi.fn(async () => ({ saved: true }));
    await expect(programme.withBeginnerProgrammeCompletion(userId, original.workoutCompletionKey, save, viewed!.workout))
      .rejects.toMatchObject({ status: 409 });
    expect(save).not.toHaveBeenCalled();
    expect(Number((await db.query("select count(*) from analytics_events where user_id=$1 and event_name='burn_log'", [userId])).rows[0].count)).toBe(0);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
  });

  it("records no plan or AI allowance after generation failure, and records one on retry", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const generateUnreliably = vi.fn().mockRejectedValueOnce(new Error("Provider failed")).mockResolvedValue(fixture);
    const input = { userId, request, timezoneOffsetMinutes: -480, generate: generateUnreliably };
    await expect(programme.generateBeginnerProgrammeWorkout(input, atDay(1))).rejects.toThrow("Provider failed");
    expect(await programme.getBeginnerProgrammeWorkout(userId)).toBeNull();
    expect(Number((await db.query("select count(*) from ai_usage_events where user_id=$1", [userId])).rows[0].count)).toBe(0);
    const saved = await programme.generateBeginnerProgrammeWorkout(input, atDay(1));
    expect(await programme.generateBeginnerProgrammeWorkout(input, atDay(1))).toMatchObject({ workoutCompletionKey: saved.workoutCompletionKey });
    expect(Number((await db.query("select count(*) from ai_usage_events where user_id=$1", [userId])).rows[0].count)).toBe(1);
    expect(generateUnreliably).toHaveBeenCalledTimes(2);
  });

  it("reconciles a saved Zoe completion but never a manual or imported workout with the same key", async () => {
    const userId = await user();
    await programme.setBeginnerProgrammeStatus(userId, "start");
    const session = await generate(userId);
    await db.query("insert into analytics_events(user_id,event_name,metadata) values($1,'burn_log',$2)", [userId,
      { workoutCompletionKey: session.workoutCompletionKey, source: "manual", completedExerciseIndexes: [0, 1, 2] }]);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(0);
    await db.query("insert into analytics_events(user_id,event_name,metadata) values($1,'burn_log',$2)", [userId,
      { workoutCompletionKey: session.workoutCompletionKey, source: "coach_zoe_workout_planner", completedExerciseIndexes: [0, 1, 2] }]);
    expect((await programme.getBeginnerProgramme(userId))?.completedSessions).toBe(1);
    expect((await programme.getBeginnerProgrammeWorkoutForCompletion(userId, session.workoutCompletionKey))?.completed).toBe(true);
  });
});
