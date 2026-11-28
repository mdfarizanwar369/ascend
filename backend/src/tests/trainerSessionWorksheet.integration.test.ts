import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import type { WorkoutCaptureDraft } from "@ascend/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { errorHandler } from "../middleware/errors";

const actors = vi.hoisted(() => new Map<string, AuthUser>());
vi.mock("../middleware/auth", async (original) => {
  const middleware = await original<typeof import("../middleware/auth")>();
  const requireAuth: typeof middleware.requireAuth = async (req, res, next) => {
    const user = actors.get(req.header("x-test-actor") ?? "");
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    next();
  };
  return { ...middleware, requireAuth };
});

const testUrl = process.env.ASCEND_TRAINER_SESSION_TEST_DATABASE_URL;
const client = randomUUID();
const trainer = randomUUID();
const otherTrainer = randomUUID();
const manager = randomUUID();
const otherManager = randomUUID();
const gym = randomUUID();
const otherGym = randomUUID();
const trainerId = randomUUID();
const otherTrainerId = randomUUID();
const workout: WorkoutCaptureDraft = {
  version: "workout_capture_v1", sourceMode: "text", originalInput: "Private draft shorthand",
  title: "Leg day", workoutType: "Strength", difficulty: "moderate", durationMinutes: 45,
  exercises: [{
    name: "Leg press", sets: 3, reps: "10", load: 80, loadUnit: "kg", originalText: "Private raw exercise text",
    durationMinutes: null, restSeconds: null, note: "Private coaching cue", movementPattern: "squat",
    confidence: 1, needsConfirmation: false
  }],
  confidence: 1, requiresReview: true, uncertainties: ["Private interpretation note"]
};
const record = {
  userConfirmed: true,
  draft: workout,
  narratives: {
    trainerNextSessionNote: "Start with slow reps next time.",
    clientRecap: "Your technique looked smoother.",
    betweenSessionFocus: "Practise the tempo."
  },
  worksheet: { focus: "Technique", priority: "Leg press", response: "Average", win: "Steadier foot position", sessionNumber: 2, sessionsPurchased: 10 }
};

describe.skipIf(!testUrl)("trainer worksheet on isolated PostgreSQL", () => {
  let db: typeof import("../db/pool");
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin: string;
  let firstSession: string;
  const users = [client, trainer, otherTrainer, manager, otherManager];
  const sessionPath = `/trainer/clients/${client}/coaching-sessions`;
  const ownerPath = `/admin/users/${client}/coaching-sessions`;

  async function call(actor: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(origin + path, {
      method,
      headers: { "x-test-actor": actor, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_trainer_session_test") {
      throw new Error("Use only the isolated trainer session test database");
    }
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("TRAINER_SESSION_CAPTURE_V1", "true");
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("WORKOUT_PROGRESSION_INTELLIGENCE_V1", "true");
    vi.stubEnv("WORKOUT_PROGRESSION_INTELLIGENCE_V3", "true");
    db = await import("../db/pool");
    const { trainerSessionsRouter } = await import("../routes/trainerSessions");
    for (const [id, name] of [[gym, "Pilot gym"], [otherGym, "Other gym"]]) {
      await db.query("insert into gyms(id, name, slug, location) values ($1,$2,$3,'Test')", [id, name, id]);
    }
    for (const [id, role, gymId, assignedTrainer] of [
      [client, "client", gym, undefined],
      [trainer, "trainer", gym, trainerId],
      [otherTrainer, "trainer", otherGym, otherTrainerId],
      [manager, "owner", undefined, undefined],
      [otherManager, "admin", otherGym, undefined]
    ] as const) {
      const email = `${id}@example.invalid`;
      await db.query("insert into users(id,firebase_uid,email,full_name,primary_role,gym_id) values($1::uuid,$1::uuid::text,$2,$3,$4,$5)", [id, email, role, role, gymId ?? null]);
      actors.set(id, { id, firebaseUid: id, email, primaryRole: role, roles: [role], gymId, trainerId: assignedTrainer, isPlatformOwner: false });
    }
    await db.query("insert into trainers(id,user_id,gym_id) values($1,$2,$3),($4,$5,$6)", [trainerId, trainer, gym, otherTrainerId, otherTrainer, otherGym]);
    await db.query("update users set assigned_trainer_id=$1 where id=$2", [trainerId, client]);
    await db.query("insert into gym_owner_assignments(user_id,gym_id) values($1,$2)", [manager, gym]);
    await db.query("insert into subscriptions(user_id,plan,provider,status) values($1,'trainer_pro','manual','active'),($2,'trainer_pro','manual','active')", [trainer, otherTrainer]);
    const app = express().use(express.json()).use(trainerSessionsRouter).use(errorHandler);
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (db) {
      await db.query("update users set assigned_trainer_id=null where id=$1", [client]);
      await db.query("delete from users where id=any($1::uuid[])", [users]);
      await db.query("delete from gyms where id=any($1::uuid[])", [[gym, otherGym]]);
      await db.pool.end();
    }
    actors.clear();
    vi.unstubAllEnvs();
  });

  it("enforces assignment and saves an unshared recap exactly once", async () => {
    expect((await call(otherTrainer, sessionPath)).status).toBe(403);
    expect((await call(otherTrainer, sessionPath, { mode: "blank" })).status).toBe(403);
    expect((await call(manager, sessionPath, { mode: "blank" })).status).toBe(403);
    expect((await call(client, ownerPath)).status).toBe(403);
    const started = await call(trainer, sessionPath, { mode: "blank" });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    firstSession = started.body.session.id;
    const draftPath = `${sessionPath}/${firstSession}`;
    const complete = `${draftPath}/complete`;
    const partial = {
      version: started.body.session.version, rawInput: "Leg press 80kg 3x10", durationMinutes: 45,
      workoutDraft: { ...record.draft, title: "", exercises: [{ ...record.draft.exercises[0], name: "" }] },
      narratives: record.narratives, worksheet: { ...record.worksheet, sessionNumber: 11 }, shareClientRecap: true
    };
    expect((await call(otherTrainer, draftPath, partial, "PATCH")).status).toBe(403);
    const draftSaved = await call(trainer, draftPath, partial, "PATCH");
    expect(draftSaved.status, JSON.stringify(draftSaved.body)).toBe(200);
    const savedVersion = draftSaved.body.session.version;
    const resumed = await call(trainer, sessionPath);
    expect(resumed.body.activeSession).toMatchObject({
      id: firstSession, rawInput: partial.rawInput, version: savedVersion,
      worksheet: partial.worksheet, narratives: record.narratives, shareClientRecap: true,
      workoutDraft: { title: "", exercises: [{ name: "" }] }
    });
    expect((await call(manager, ownerPath)).body.sessions).toEqual([]);
    expect((await call(client, "/me/coaching-sessions")).body.sessions).toEqual([]);
    expect((await call(trainer, draftPath, partial, "PATCH")).status).toBe(409);
    expect((await call(trainer, complete, { ...record, version: partial.version })).status).toBe(409);
    expect((await call(trainer, `${draftPath}?version=${partial.version}`, undefined, "DELETE")).body.cancelled).toBe(false);
    const interpret = await call(trainer, `${draftPath}/interpret`, {
      version: savedVersion, rawInput: partial.rawInput, durationMinutes: 45
    });
    expect(interpret.status, JSON.stringify(interpret.body)).toBe(200);
    expect(interpret.body).toMatchObject({
      version: savedVersion + 1, draft: { originalInput: partial.rawInput }, narratives: record.narratives
    });
    const invalid = await call(trainer, complete, { ...record, worksheet: { ...record.worksheet, sessionNumber: 11 } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues[0]).toMatchObject({ path: ["worksheet", "sessionNumber"] });
    const currentRecord = { ...record, version: interpret.body.version };
    const requests = await Promise.all([call(trainer, complete, currentRecord), call(trainer, complete, currentRecord)]);
    for (const result of requests) expect(result.status, JSON.stringify(result.body)).toBe(200);
    const retry = await call(trainer, complete, { ...currentRecord, shareClientRecap: true });
    expect(retry.body.session.shareClientRecap).toBe(false);
    const receipt = await call(client, "/me/coaching-sessions");
    expect(receipt.body.sessions).toHaveLength(1);
    expect(receipt.body.sessions[0]).toMatchObject({
      clientRecap: null, betweenSessionFocus: null,
      exercises: [{ name: "Leg press", sets: 3, reps: "10", load: 80 }]
    });
    expect(receipt.body.sessions[0]).not.toHaveProperty("packageProgress");
    expect(JSON.stringify(receipt.body)).not.toMatch(/Private|Steadier|slow reps|smoother/);
    const events = await db.query("select metadata from analytics_events where user_id=$1 and event_name='burn_log'", [client]);
    expect(events.rows).toHaveLength(1);
    expect(JSON.stringify(events.rows)).not.toMatch(/Private|Steadier|slow reps|smoother|sessionsPurchased|sessionNumber/);
  });

  it("carries coaching forward and shares only the approved member recap", async () => {
    const overview = await call(trainer, sessionPath);
    expect(overview.body.recentSessions[0]).toMatchObject({ id: firstSession, narratives: { trainerNextSessionNote: record.narratives.trainerNextSessionNote } });
    const managerHistory = await call(manager, ownerPath);
    expect(managerHistory.body.sessions[0]).toMatchObject({
      id: firstSession, worksheet: record.worksheet, shareClientRecap: false,
      exercises: [{ note: "Private coaching cue" }]
    });
    expect((await call(otherManager, ownerPath)).status).toBe(403);
    const repeat = await call(trainer, sessionPath, { mode: "repeat_last" });
    expect(repeat.status, JSON.stringify(repeat.body)).toBe(201);
    expect(repeat.body.session).toMatchObject({ rawInput: "", workoutDraft: { sourceMode: "repeat", exercises: [{ load: 80 }] } });
    expect((await call(manager, ownerPath)).body.sessions).toHaveLength(1);
    const completed = await call(trainer, `${sessionPath}/${repeat.body.session.id}/complete`, {
      ...record, worksheet: { ...record.worksheet, sessionNumber: 1, sessionsPurchased: 6 }, shareClientRecap: true
    });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    const member = await call(client, "/me/coaching-sessions");
    expect(member.body.sessions[0]).toMatchObject({
      clientRecap: record.narratives.clientRecap, betweenSessionFocus: record.narratives.betweenSessionFocus,
      packageProgress: { sessionNumber: 1, sessionsPurchased: 6 }
    });
    expect(JSON.stringify(member.body)).not.toMatch(/Private|Steadier|slow reps/);
  });

  it("supports same-gym handovers and excludes private coaching history after a gym transfer", async () => {
    await db.query("update trainers set gym_id=$1 where id=$2", [gym, otherTrainerId]);
    await db.query("update users set assigned_trainer_id=$1 where id=$2", [otherTrainerId, client]);
    expect((await call(trainer, sessionPath)).status).toBe(403);
    expect((await call(otherTrainer, sessionPath)).body.recentSessions).toHaveLength(2);
    await db.query("update trainers set gym_id=$1 where id=$2", [otherGym, otherTrainerId]);
    await db.query("update users set gym_id=$1, assigned_trainer_id=$2 where id=$3", [otherGym, otherTrainerId, client]);
    expect((await call(trainer, sessionPath)).status).toBe(403);
    expect((await call(manager, ownerPath)).status).toBe(403);
    expect((await call(otherManager, ownerPath)).body.sessions).toEqual([]);
    expect((await call(otherTrainer, sessionPath)).body).toMatchObject({ recentSessions: [], previousWorkout: null });
    const started = await call(otherTrainer, sessionPath, { mode: "blank" });
    const path = `${sessionPath}/${started.body.session.id}`;
    const saved = await call(otherTrainer, path, {
      version: started.body.session.version, rawInput: "", worksheet: { sessionNumber: 1 }, narratives: record.narratives
    }, "PATCH");
    expect((await call(otherTrainer, `${path}?version=${saved.body.session.version}`, undefined, "DELETE")).body.cancelled).toBe(true);
    expect((await call(otherTrainer, sessionPath)).body.activeSession).toBeNull();
    const discarded = await db.query("select trainer_next_session_note, worksheet from trainer_coaching_sessions where id=$1", [started.body.session.id]);
    expect(discarded.rows[0]).toEqual({ trainer_next_session_note: null, worksheet: {} });
  });
});
