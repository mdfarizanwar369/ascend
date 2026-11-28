import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { ptLocalDate, shiftPtDate } from "@ascend/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { errorHandler } from "../middleware/errors";

const actors = vi.hoisted(() => new Map<string, AuthUser>());
vi.mock("../middleware/auth", async (original) => {
  const auth = await original<typeof import("../middleware/auth")>();
  const requireAuth: typeof auth.requireAuth = async (req, res, next) => {
    const actor = actors.get(req.header("x-test-actor") ?? "");
    if (!actor) return res.status(401).json({ error: "Authentication required." });
    req.user = actor;
    next();
  };
  return { ...auth, requireAuth };
});

const testUrl = process.env.ASCEND_TRAINER_SESSION_TEST_DATABASE_URL;
const [gym, otherGym, owner, otherOwner, coach, otherCoach, trainerId, otherTrainerId, coached, solo, outsider] =
  Array.from({ length: 11 }, () => randomUUID());
const zone = "Asia/Kuala_Lumpur";
const today = ptLocalDate(new Date(), zone);
const ios18 = { "user-agent": "AscendIOS/6 AscendSubscriptions/1 AscendHealth/1 AscendPush/1 AscendCycle/1 Capacitor", "x-ascend-edition": "ios-subscriptions-v1" };
const body = {
  gymId: gym, title: "Build your routine", template: "meals", actions: ["meals", "hydration", "movement"],
  requiredActions: 3, startsOn: today, endsOn: shiftPtDate(today, 20), goalDays: 1, leaderboard: true, publish: true
};

describe.skipIf(!testUrl)("Monthly challenge permissions and scoring", () => {
  let db: typeof import("../db/pool");
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin: string;

  async function call(who: string, path: string, method = "GET", data?: unknown, headers?: Record<string, string>) {
    const reply = await fetch(origin + "/monthly-challenges/" + path, {
      method, headers: { "x-test-actor": who, "content-type": "application/json", ...headers },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: reply.status, data: await reply.json() };
  }

  beforeAll(async () => {
    const target = new URL(testUrl!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/ascend_trainer_session_test") throw Error("Use only the isolated Ascend test database");
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("MONTHLY_CHALLENGES_V1", "true");
    db = await import("../db/pool");
    const { monthlyChallengesRouter } = await import("../routes/monthlyChallenges");
    await db.query("insert into gyms (id,name,slug,location,timezone) values ($1,'Gym One',$1::uuid::text,'Test',$3),($2,'Gym Two',$2::uuid::text,'Test',$3)", [gym, otherGym, zone]);
    for (const [id, role, home, trainer] of [
      [owner, "owner", gym], [otherOwner, "owner", otherGym], [coach, "trainer", gym, trainerId],
      [otherCoach, "trainer", gym, otherTrainerId], [coached, "client", gym], [solo, "client", gym], [outsider, "client", otherGym]
    ] as const) {
      const email = id + "@example.invalid";
      await db.query("insert into users (id,firebase_uid,email,full_name,primary_role,gym_id) values ($1,$1::uuid::text,$2,$3,$3::text::user_role,$4)", [id, email, role, home]);
      actors.set(id, { id, firebaseUid: id, email, primaryRole: role, roles: [role], gymId: home, trainerId: trainer, isPlatformOwner: false });
    }
    await db.query("insert into trainers (id,user_id,gym_id) values ($1,$2,$5),($3,$4,$5)", [trainerId, coach, otherTrainerId, otherCoach, gym]);
    await db.query("update users set assigned_trainer_id=$1 where id=$2", [trainerId, coached]);
    const app = express().use(express.json()).use(monthlyChallengesRouter).use(errorHandler);
    server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  }, 15_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (db) {
      const ids = [owner, otherOwner, coach, otherCoach, coached, solo, outsider];
      await db.query("update users set assigned_trainer_id=null where id=any($1::uuid[])", [ids]);
      await db.query("delete from analytics_events where user_id=any($1::uuid[])", [ids]);
      await db.query("delete from users where id=any($1::uuid[])", [ids]);
      await db.query("delete from gyms where id=any($1::uuid[])", [[gym, otherGym]]);
      await db.pool.end();
    }
    vi.unstubAllEnvs();
  });

  it("keeps drafts private, locks published rules and limits trainer entries to assigned clients", async () => {
    expect((await call(coach, "trainer", "POST", body, { "user-agent": "AscendIOS/6 AscendSubscriptions/1 AscendPush/1 Capacitor" })).status).toBe(404);
    expect((await call(coach, "trainer", "GET", undefined, { "user-agent": "AscendAndroid/1 Capacitor" })).status).toBe(404);
    expect((await call(coach, "trainer", "GET", undefined, { "x-ascend-edition": "ios-subscriptions-v1" })).status).toBe(404);
    const saved = await call(coach, "trainer", "POST", { ...body, publish: false }, ios18);
    expect(saved.status).toBe(201);
    const id = saved.data.id;
    expect((await call(coached, "member/" + id)).status).toBe(404);
    expect((await call(otherCoach, "trainer/" + id)).status).toBe(404);
    expect((await call(owner, "gym/" + id)).status).toBe(404);
    expect((await call(coach, "trainer/" + id)).data.challenge).toMatchObject({ status: "draft", version: 1 });
    expect((await call(coach, "trainer/" + id, "PUT", { ...body, version: 1 }, ios18)).status).toBe(200);
    expect((await call(coach, "trainer/" + id, "PUT", { ...body, version: 2 })).status).toBe(409);
    expect((await call(solo, "member/" + id + "/membership", "PUT", { displayName: null })).status).toBe(404);
    expect((await call(coached, "member/" + id + "/membership", "PUT", { displayName: null })).status).toBe(200);
    expect((await call(coached, "member/" + id)).data.membership).toMatchObject({ score: 0, displayName: null });
  });

  it("lets a gym member without a trainer join, scores actual logs once per day and shares only an opted-in name", async () => {
    expect((await call(otherOwner, "gym", "POST", body)).status).toBe(403);
    const created = await call(owner, "gym", "POST", body, ios18);
    expect(created.status).toBe(201);
    const id = created.data.id;
    expect((await call(outsider, "member/" + id)).status).toBe(404);
    expect((await call(solo, "member/" + id + "/membership", "PUT", { displayName: null }, ios18)).status).toBe(200);
    expect((await call(solo, "member/" + id + "/meal-day", "PUT", { day: today })).status).toBe(400);
    const personal = (await call(solo, "member/" + id)).data.membership;
    expect(personal.waterTargetMl).toBeGreaterThan(0);
    await db.query("insert into food_logs (user_id,estimated_food_name,calories,protein_g,carbs_g,fat_g) values ($1,'Private meal',450,20,50,10)", [solo]);
    await db.query("insert into water_logs (user_id,amount_ml) values ($1,$2)", [solo, personal.waterTargetMl]);
    await db.query("insert into analytics_events (user_id,gym_id,event_name,metadata) values ($1,$2,'burn_log','{}'),($1,$2,'burn_log','{}')", [solo, gym]);
    expect((await call(solo, "member/" + id)).data.membership).toMatchObject({ score: 0, mealLogAvailable: true });
    expect((await call(solo, "member/" + id + "/meal-day", "PUT", { day: shiftPtDate(today, -1) })).status).toBe(409);
    expect((await call(solo, "member/" + id + "/meal-day", "PUT", { day: today })).status).toBe(200);
    expect((await call(solo, "member/" + id + "/meal-day", "PUT", { day: today })).status).toBe(200);
    expect((await call(solo, "member/" + id, "GET", undefined, ios18)).data.membership).toMatchObject({ score: 1 });
    const privateState = (await call(owner, "gym/" + id)).data;
    expect(privateState).toMatchObject({ joinedCount: 1, completedCount: 1, leaderboard: [], membership: null });
    expect(JSON.stringify(privateState)).not.toContain("Private meal");
    expect((await call(solo, "member/" + id + "/membership", "PUT", { displayName: "Solo Walker" })).status).toBe(200);
    expect((await call(owner, "gym/" + id)).data.leaderboard).toEqual([{ rank: 1, name: "Solo Walker", score: 1, isMe: false }]);
    expect((await call(coached, "member/" + id)).data.leaderboard).toEqual([]);
    expect((await call(solo, "member/" + id + "/membership", "DELETE")).status).toBe(200);
    expect((await call(owner, "gym/" + id)).data).toMatchObject({ joinedCount: 0, leaderboard: [] });
  });
});
