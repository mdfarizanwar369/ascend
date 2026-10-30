import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CoachWorkoutPlan } from "../integrations/openai";

const testUrl = process.env.ASCEND_HARDENING_TEST_DATABASE_URL;
const identity = vi.hoisted(() => ({ userId: "" }));
vi.mock("../middleware/auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => {
  req.user = { id: identity.userId, roles: ["client"], primaryRole: "client", isPlatformOwner: true };
  next();
} }));

const users: string[] = [];
let db: typeof import("../db/pool");
let programme: typeof import("../services/beginnerProgrammeService");
let server: Server | undefined;
let base = "";
const fixture: CoachWorkoutPlan = {
  title: "Deletion test fixture", intro: "Test only", focus: "Full body strength", intensity: "easy", estimatedDurationMinutes: 30,
  experienceVersion: 2, warmup: ["Walk gently"], cooldown: ["Walk gently"], coachTip: "Test", disclaimer: "Isolated test fixture",
  exercises: [{ name: "Seated Leg Press", sets: 2, reps: "8" }, { name: "Machine Chest Press", sets: 2, reps: "8" },
    { name: "Seated Cable Row", sets: 2, reps: "8" }]
};

async function user() {
  const id = randomUUID(); users.push(id);
  await db.query("insert into users(id,firebase_uid,email,full_name) values($1,$2,$3,'Deletion fixture')", [id, `test-${id}`, `${id}@example.invalid`]);
  return id;
}

async function burn(userId: string, metadata: Record<string, unknown> = {}) {
  const saved = await db.query<{ id: string }>("insert into analytics_events(user_id,event_name,metadata) values($1,'burn_log',$2) returning id", [userId, metadata]);
  return saved.rows[0].id;
}

async function completedRoutine(userId: string) {
  await programme.setBeginnerProgrammeStatus(userId, "start");
  const session = await programme.generateBeginnerProgrammeWorkout({ userId,
    request: { location: "gym", equipment: "Full Gym", goal: "general_fitness", timeAvailable: "30" },
    timezoneOffsetMinutes: -480, recordUsage: false, generate: async () => fixture });
  return programme.withBeginnerProgrammeCompletion(userId, session.workoutCompletionKey, () => burn(userId, {
    workoutCompletionKey: session.workoutCompletionKey, source: "coach_zoe_workout_planner",
    completedExerciseIndexes: [0, 1, 2], completionStatus: "complete"
  }), session.workout);
}

describe.skipIf(!testUrl)("burn-log deletion against the real isolated schema", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_hardening_test") throw new Error("Only the isolated local hardening test database is allowed");
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_POOL_MAX", "2");
    vi.stubEnv("DATABASE_CONNECT_TIMEOUT_MS", "1000");
    db = await import("../db/pool");
    programme = await import("../services/beginnerProgrammeService");
    const { logsRouter } = await import("../routes/logs");
    const { errorHandler } = await import("../middleware/errors");
    const app = express(); app.use(express.json()); app.use(logsRouter); app.use(errorHandler);
    server = app.listen(0, "127.0.0.1");
    if (!server.listening) await new Promise<void>(resolve => server!.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) {
      const closed = new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    }
    if (db) {
      await db.query("delete from analytics_events where user_id=any($1::uuid[])", [users]);
      await db.query("delete from users where id=any($1::uuid[])", [users]);
      await db.pool.end();
    }
    vi.unstubAllEnvs();
  });

  it("deletes an ordinary activity without relying on nonexistent homework columns", async () => {
    const ownerId = await user(); identity.userId = ownerId;
    const id = await burn(ownerId, { source: "manual", durationMinutes: 20 });
    const response = await fetch(`${base}/burn-logs/${id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, burnLogId: id });
    expect((await db.query("select id from analytics_events where id=$1", [id])).rows).toHaveLength(0);
  });

  it("reverses programme credit and resets the exact linked trainer homework", async () => {
    const ownerId = await user(); identity.userId = ownerId;
    const id = await completedRoutine(ownerId);
    const homework = await db.query<{ id: string }>(`insert into trainer_homework_assignments
      (assigned_by_user_id,client_id,workout_json,title,goal,location,duration_minutes,intensity,
       assignment_date,due_date,status,completed_at,completed_burn_log_id)
      values($1,$1,$2,'Deletion fixture','general_fitness','gym',30,'easy',current_date,current_date,
        'completed',now(),$3) returning id`, [ownerId, fixture, id]);
    expect((await programme.getBeginnerProgramme(ownerId))?.completedSessions).toBe(1);

    const response = await fetch(`${base}/burn-logs/${id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, burnLogId: id });
    expect((await programme.getBeginnerProgramme(ownerId))?.completedSessions).toBe(0);
    expect((await programme.getBeginnerProgramme(ownerId))?.nextSessionNumber).toBe(1);
    expect((await db.query("select status,completed_at,completed_burn_log_id from trainer_homework_assignments where id=$1", [homework.rows[0].id])).rows[0])
      .toEqual({ status: "assigned", completed_at: null, completed_burn_log_id: null });
    expect((await db.query("select burn_log_id from zoe_beginner_programme_sessions where user_id=$1", [ownerId])).rows[0].burn_log_id).toBeNull();
  });

  it("cannot delete another account's activity or change its linked homework", async () => {
    const ownerId = await user();
    const otherId = await user();
    const id = await completedRoutine(ownerId);
    const homework = await db.query<{ id: string }>(`insert into trainer_homework_assignments
      (assigned_by_user_id,client_id,workout_json,title,goal,location,duration_minutes,intensity,
       assignment_date,due_date,status,completed_at,completed_burn_log_id)
      values($1,$1,$2,'Scope fixture','general_fitness','gym',30,'easy',current_date,current_date,
        'completed',now(),$3) returning id`, [ownerId, fixture, id]);
    identity.userId = otherId;
    const response = await fetch(`${base}/burn-logs/${id}`, { method: "DELETE" });
    expect(response.status).toBe(404);
    expect((await db.query("select id from analytics_events where id=$1", [id])).rows).toHaveLength(1);
    expect((await programme.getBeginnerProgramme(ownerId))?.completedSessions).toBe(1);
    expect((await db.query("select status,completed_burn_log_id from trainer_homework_assignments where id=$1", [homework.rows[0].id])).rows[0])
      .toEqual({ status: "completed", completed_burn_log_id: id });
  });
});
