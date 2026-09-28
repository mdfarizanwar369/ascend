import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CoachWorkoutPlan } from "../integrations/openai";

const testUrl = process.env.ASCEND_HARDENING_TEST_DATABASE_URL;
const prefix = `hardening-test:${randomUUID()}`;
const users: string[] = [];
let db: typeof import("../db/pool");
let leases: typeof import("../services/aiWorkLeaseService");
let workouts: typeof import("../services/iosDailyWorkoutService");
const request = { location: "home", timeAvailable: "20", goal: "general_fitness", equipment: "Bodyweight" } as const;
const workout: CoachWorkoutPlan = {
  title: "Test workout", intro: "Test only", estimatedDurationMinutes: 20, focus: "General fitness", intensity: "easy",
  warmup: ["Walk"], exercises: [{ name: "Chair squat", sets: 2, reps: "8" }], cooldown: ["Walk"], coachTip: "Rest", disclaimer: "Test fixture"
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function user() {
  const id = randomUUID(); users.push(id);
  await db.query("insert into users (id,firebase_uid,email,full_name) values ($1,$2,$3,'Concurrency fixture')", [id, `test-${id}`, `${id}@example.invalid`]);
  return id;
}

describe.skipIf(!testUrl)("AI concurrency with isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_hardening_test") throw new Error("Only the isolated local hardening test database is allowed");
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_POOL_MAX", "2");
    vi.stubEnv("DATABASE_CONNECT_TIMEOUT_MS", "1000");
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "local-test-not-a-real-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
    db = await import("../db/pool");
    leases = await import("../services/aiWorkLeaseService");
    workouts = await import("../services/iosDailyWorkoutService");
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    if (db) {
      await db.query("delete from ai_usage_events where user_id=any($1::uuid[])", [users]);
      await db.query("delete from users where id=any($1::uuid[])", [users]);
      await db.query("delete from ai_work_leases where resource like $1", [`${prefix}%`]);
      await db.pool.end();
    }
    vi.unstubAllEnvs();
  });

  it("runs with data access but cannot modify schema, migration history, or roles", async () => {
    expect((await db.query("select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname=current_user")).rows[0])
      .toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    const { verifyRuntimeSchema } = await import("../db/bootstrap");
    await expect(verifyRuntimeSchema()).resolves.toBeUndefined();
    for (const sql of ["create table public.must_not_create(id int)",
      "delete from schema_migrations where filename='041_ai_work_leases.sql'",
      "create role must_not_create_role"]) {
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await expect(client.query(sql)).rejects.toMatchObject({ code: "42501" });
      } finally { await client.query("rollback"); client.release(); }
    }
  });

  it("keeps ordinary reads available while twelve workouts wait on AI with only two DB connections", async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => user()));
    const unblock = deferred(); let started = 0;
    const pending = ids.map(userId => workouts.generateIosDailyWorkout({ userId, request, timezoneOffsetMinutes: -480,
      generate: async () => { started++; await unblock.promise; return workout; } }));
    try {
      await vi.waitFor(() => expect(started).toBe(12), { timeout: 5000 });
      expect(db.pool.waitingCount).toBe(0);
      const start = Date.now();
      expect((await db.query("select 1 as alive")).rows[0].alive).toBe(1);
      expect(Date.now() - start).toBeLessThan(500);
    } finally { unblock.resolve(); }
    const saved = await Promise.all(pending);
    expect(new Set(saved.map(x => x.workoutCompletionKey)).size).toBe(12);
    expect(Number((await db.query("select count(*) from ios_daily_workouts where user_id=any($1::uuid[])", [ids])).rows[0].count)).toBe(12);
  });

  it("prevents duplicate workouts and reuses the saved plan", async () => {
    const userId = await user(); const unblock = deferred(); let started = false;
    const generate = vi.fn(async () => { started = true; await unblock.promise; return workout; });
    const input = { userId, request, timezoneOffsetMinutes: -480, generate };
    const first = workouts.generateIosDailyWorkout(input);
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      await expect(workouts.generateIosDailyWorkout(input)).rejects.toMatchObject({ name: "AiWorkBusyError" });
    } finally { unblock.resolve(); }
    const saved = await first;
    expect(await workouts.generateIosDailyWorkout(input)).toMatchObject({ workoutCompletionKey: saved.workoutCompletionKey });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("releases a failed generation so the user can retry without losing the allowance", async () => {
    const userId = await user();
    const generate = vi.fn().mockRejectedValueOnce(new Error("provider failed")).mockResolvedValueOnce(workout);
    const input = { userId, request, timezoneOffsetMinutes: -480, generate };
    await expect(workouts.generateIosDailyWorkout(input)).rejects.toThrow("provider failed");
    expect(await workouts.getIosDailyWorkout(userId)).toBeNull();
    await expect(workouts.generateIosDailyWorkout(input)).resolves.toMatchObject({ workout });
  });

  it("fences an expired worker before it can commit a result", async () => {
    const resource = `${prefix}:expired`;
    const unblock = deferred(); let started = false;
    const first = leases.withAiWorkLease(resource, async () => {
      started = true; await unblock.promise;
      return leases.withAiWorkTransaction(async () => "must not commit");
    });
    const rejected = expect(first).rejects.toMatchObject({ name: "AiWorkBusyError" });
    await vi.waitFor(() => expect(started).toBe(true));
    await db.query("update ai_work_leases set expires_at=now()-interval '1 second' where resource=$1", [resource]);
    await expect(leases.withAiWorkLease(resource, async () => "replacement")).resolves.toBe("replacement");
    unblock.resolve(); await rejected;
  });

  it("enforces provider capacity across two independent gates and bounds the waiting queue", async () => {
    const resource = `${prefix}:provider`;
    const gateA = leases.createAiProviderGate(2, 1, 1000), gateB = leases.createAiProviderGate(2, 1, 1000);
    const unblock = deferred(); let active = 0;
    const work = async () => { active++; await unblock.promise; return "done"; };
    const a = gateA(resource, work), b = gateB(resource, work);
    try {
      await vi.waitFor(() => expect(active).toBe(2));
      await expect(gateA(resource, work)).rejects.toMatchObject({ name: "AiWorkBusyError" });
      const single = leases.createAiProviderGate(1, 0);
      const c = single(`${prefix}:single`, work);
      try {
        await vi.waitFor(() => expect(active).toBe(3));
        await expect(single(`${prefix}:single`, work)).rejects.toMatchObject({ name: "AiWorkBusyError" });
      } finally { unblock.resolve(); await c; }
    } finally { unblock.resolve(); }
    await Promise.all([a, b]);
  });

  it("serializes actual typed-food allowance checks and only sends one provider request for concurrent calls", async () => {
    const userId = await user();
    const { withAppEdition } = await import("../services/appEdition");
    const { withAiDataSubject, saveAiConsent } = await import("../services/aiConsentService");
    const { AI_CONSENT_VERSION } = await import("@ascend/shared");
    const { estimateFoodFromText } = await import("../integrations/openai");
    await saveAiConsent(userId, { provider: "gemini", version: AI_CONSENT_VERSION, allowed: true });
    await db.query("insert into ai_usage_events(user_id,event_type,provider,status) values($1,'food_image_analysis','gemini','success')", [userId]);
    const unblock = deferred(); let started = false;
    const fetchMock = vi.fn(async () => {
      started = true; await unblock.promise;
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ foodName: "Test banana", confidence: 0.9, calories: 100, proteinG: 1, carbsG: 25, fatG: 0, notes: "Test fixture" }) }] } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const estimate = () => withAppEdition(true, () => withAiDataSubject(userId, () => estimateFoodFromText("one banana", { userId, timezoneOffsetMinutes: -480 })));
    const first = estimate();
    try {
      await vi.waitFor(() => expect(started).toBe(true), { timeout: 5000 });
      const others = await Promise.allSettled(Array.from({ length: 12 }, estimate));
      expect(others.every(x => x.status === "rejected" && x.reason.name === "AiWorkBusyError")).toBe(true);
    } finally { unblock.resolve(); }
    await expect(first).resolves.toMatchObject({ calories: 100 });
    await expect(estimate()).rejects.toMatchObject({ name: "FoodAiLimitError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
