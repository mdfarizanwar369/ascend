import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { ptLocalDate, shiftPtDate } from "@ascend/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { errorHandler } from "../middleware/errors";

const actors = vi.hoisted(() => new Map<string, AuthUser>());
vi.mock("../middleware/auth", async (original) => {
  const middleware = await original<typeof import("../middleware/auth")>();
  const requireAuth: typeof middleware.requireAuth = async (req, res, next) => {
    const actor = actors.get(req.header("x-test-actor") ?? "");
    if (!actor) return res.status(401).json({ error: "Authentication required." });
    req.user = actor;
    next();
  };
  return { ...middleware, requireAuth };
});

const testUrl = process.env.ASCEND_TRAINER_SESSION_TEST_DATABASE_URL;
const [gym, otherGym, trainer, otherTrainer, trainerProfile, otherTrainerProfile, client, peer, manager, otherManager] =
  Array.from({ length: 10 }, () => randomUUID());
const people = [trainer, otherTrainer, client, peer, manager, otherManager];
const timeZone = "Asia/Kuala_Lumpur";
const date = shiftPtDate(ptLocalDate(new Date(), timeZone), 1);
const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const firstTime = `${date}T17:00:00+08:00`;
const secondTime = `${date}T18:00:00+08:00`;
const thirdTime = `${date}T19:00:00+08:00`;
const clientApi = "/pt-bookings/client";
const trainerApi = "/pt-bookings/trainer";
const managerApi = "/pt-bookings/manager";

describe.skipIf(!testUrl)("PT booking routes on isolated PostgreSQL", () => {
  let db: typeof import("../db/pool");
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin: string;

  async function call(actor: string, path: string, method = "GET", data?: unknown) {
    const response = await fetch(origin + path, {
      method,
      headers: { "x-test-actor": actor, "content-type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_trainer_session_test") {
      throw new Error("Use only the isolated trainer session test database");
    }
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("PT_BOOKING_V1", "true");
    db = await import("../db/pool");
    const { ptBookingsRouter } = await import("../routes/ptBookings");
    await db.query("insert into gyms (id,name,slug,location,timezone) values ($1,'Pilot',$3,'Test',$5),($2,'Other',$4,'Test',$5)",
      [gym, otherGym, gym, otherGym, timeZone]);
    for (const [id, role, home, profile] of [
      [trainer, "trainer", gym, trainerProfile], [otherTrainer, "trainer", otherGym, otherTrainerProfile],
      [client, "client", gym], [peer, "client", gym], [manager, "owner", gym], [otherManager, "admin", otherGym]
    ] as const) {
      const email = `${id}@example.invalid`;
      await db.query("insert into users (id,firebase_uid,email,full_name,primary_role,gym_id) values($1::uuid,$1::uuid::text,$2,$3,$3::text::user_role,$4)",
        [id, email, role, home]);
      actors.set(id, { id, firebaseUid: id, email, primaryRole: role, roles: [role], gymId: home, trainerId: profile, isPlatformOwner: false });
    }
    await db.query("insert into trainers (id,user_id,gym_id) values ($1,$2,$3),($4,$5,$6)", [trainerProfile, trainer, gym, otherTrainerProfile, otherTrainer, otherGym]);
    await db.query("update users set assigned_trainer_id = $1 where id = any($2::uuid[])", [trainerProfile, [client, peer]]);
    const app = express().use(express.json()).use(ptBookingsRouter).use(errorHandler);
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 15_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (db) {
      await db.query("update users set assigned_trainer_id = null where id = any($1::uuid[])", [[client, peer]]);
      await db.query("delete from users where id = any($1::uuid[])", [people]);
      await db.query("delete from gyms where id = any($1::uuid[])", [[gym, otherGym]]);
      await db.pool.end();
    }
    vi.unstubAllEnvs();
  });

  it("restricts roles, publishes local-time slots, serializes approvals, and cancels on reassignment", async () => {
    expect((await call("", clientApi)).status).toBe(401);
    expect((await call(client, trainerApi)).status).toBe(403);
    expect((await call(trainer, managerApi)).status).toBe(403);
    expect((await call(otherManager, `${managerApi}?gymId=${gym}`)).status).toBe(403);
    expect((await call(trainer, `${trainerApi}/availability`, "PUT", {
      availability: [{ weekday, opensAt: "07:00", closesAt: "07:30" }]
    })).status).toBe(400);

    const availability = [{ weekday, opensAt: "17:00", closesAt: "20:00" }];
    expect(await call(trainer, `${trainerApi}/availability`, "PUT", { availability }))
      .toEqual({ status: 200, body: { saved: true } });
    const available = await call(client, `${clientApi}?week=${date}`);
    expect(available.status, JSON.stringify(available.body)).toBe(200);
    expect(available.body.gym.timeZone).toBe(timeZone);
    expect(available.body.slots.map((slot: { startsAt: string }) => slot.startsAt))
      .toEqual([firstTime, secondTime, thirdTime].map((local) => new Date(local).toISOString()));

    const ask = (actor: string, startsAt: string, profile = trainerProfile) =>
      call(actor, `${clientApi}/requests`, "POST", { trainerId: profile, startsAt });
    expect((await ask(client, firstTime, otherTrainerProfile)).status).toBe(403);
    expect((await ask(client, `${date}T17:25:00+08:00`)).status).toBe(409);
    const duplicates = await Promise.all([ask(client, firstTime), ask(client, firstTime)]);
    expect(duplicates.map((request) => request.status)).toEqual([201, 201]);
    expect(duplicates[0].body.id).toBe(duplicates[1].body.id);
    const otherRequest = await ask(peer, firstTime);
    expect(otherRequest.status).toBe(201);
    const ids = [duplicates[0].body.id, otherRequest.body.id];

    const confirm = (actor: string, id: string, path = trainerApi) =>
      call(actor, `${path}/requests/${id}`, "PATCH", { action: "confirm" });
    expect((await confirm(client, ids[0], clientApi)).status).toBe(403);
    expect((await confirm(otherTrainer, ids[0])).status).toBe(404);
    expect((await confirm(manager, ids[0], managerApi)).status).toBe(404);
    expect((await call(peer, `${clientApi}/requests/${ids[0]}`, "PATCH", { action: "cancel" })).status).toBe(404);

    const confirmations = await Promise.all(ids.map((id) => confirm(trainer, id)));
    expect(confirmations.map((result) => result.status).sort()).toEqual([200, 409]);
    const winnerIndex = confirmations.findIndex((result) => result.status === 200);
    const winningClient = [client, peer][winnerIndex];
    const otherClient = [peer, client][winnerIndex];
    const winningId = ids[winnerIndex];
    expect((await confirm(trainer, winningId)).status).toBe(200);
    expect((await ask(otherClient, firstTime)).status).toBe(409);
    const weekPath = (path: string) => `${path}?week=${date}`;
    const clubSchedule = await call(manager, weekPath(managerApi));
    expect(clubSchedule.body.bookings.map((booking: { status: string }) => booking.status).sort()).toEqual(["confirmed", "declined"]);
    expect((await call(otherManager, weekPath(managerApi))).body.bookings).toEqual([]);
    expect((await call(winningClient, weekPath(clientApi))).body.bookings).toEqual([
      expect.objectContaining({ id: winningId, status: "confirmed", clientId: winningClient })
    ]);

    await expect(db.query(`
      insert into pt_bookings (gym_id,trainer_id,client_id,starts_at,ends_at,status)
      values ($1,$2,$3,$4::timestamptz + interval '15 min',$4::timestamptz + interval '75 min','confirmed')
    `, [gym, trainerProfile, otherClient, firstTime])).rejects.toMatchObject({ code: "23P01" });

    const next = await ask(winningClient, secondTime);
    expect(next.status).toBe(201);
    expect((await confirm(trainer, next.body.id)).status).toBe(200);
    await db.query("update users set assigned_trainer_id = null where id = $1", [winningClient]);
    expect((await call(winningClient, weekPath(clientApi))).body.bookings.map((booking: { status: string }) => booking.status))
      .toEqual(["cancelled", "cancelled"]);
    expect((await call(trainer, weekPath(trainerApi))).body.bookings.map((booking: { clientId: string }) => booking.clientId))
      .toEqual([otherClient]);
    const released = await ask(otherClient, firstTime);
    expect(released.status).toBe(201);
    expect((await call(otherClient, `${clientApi}/requests/${released.body.id}`, "PATCH", { action: "cancel" })).status).toBe(200);
    expect((await ask(otherClient, firstTime)).status).toBe(201);
  });
});
