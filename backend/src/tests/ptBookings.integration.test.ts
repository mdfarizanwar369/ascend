import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { ptLocalDate, shiftPtDate } from "@ascend/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { errorHandler } from "../middleware/errors";

const actors = vi.hoisted(() => new Map<string, AuthUser>());
const push = vi.hoisted(() => vi.fn());
vi.mock("../integrations/nudgePush", async (original) => ({
  ...await original<typeof import("../integrations/nudgePush")>(),
  sendNudgePush: push
}));
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
    const { meRouter } = await import("../routes/me");
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
    const app = express().use(express.json()).use(ptBookingsRouter).use(meRouter).use(errorHandler);
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
    const available = await call(client, `${clientApi}?week=${date}`);
    expect(available.status, JSON.stringify(available.body)).toBe(200);
    expect(available.body.gym.timeZone).toBe(timeZone);
    const daySlots = available.body.slots.filter((slot: { startsAt: string }) => ptLocalDate(new Date(slot.startsAt), timeZone) === date);
    expect(daySlots).toHaveLength(24);
    expect(daySlots[0].startsAt).toBe(new Date(`${date}T00:00:00+08:00`).toISOString());
    expect(daySlots[23].endsAt).toBe(new Date(`${shiftPtDate(date, 1)}T00:00:00+08:00`).toISOString());
    expect(daySlots.every((slot: { startsAt: string; endsAt: string }) =>
      Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 3_600_000)).toBe(true);

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

  it("books and moves a next session, publishes its updates, and derives manager follow-up from completed coaching", async () => {
    await db.query("delete from pt_bookings where gym_id = $1", [gym]);
    await db.query("update users set assigned_trainer_id = $1 where id = any($2::uuid[])", [trainerProfile, [client, peer]]);
    await db.query(`
      insert into trainer_coaching_sessions (client_id, trainer_id, created_by_user_id, gym_id, status, completed_at, workout_event_id)
      values ($1,$2,$3,$4,'completed',now() - interval '1 hour', $5)
    `, [client, trainerProfile, trainer, gym, randomUUID()]);
    await db.query("insert into notification_devices (user_id,fcm_token,platform) values ($1,$2,'android')",
      [client, `test-booking-device-${randomUUID()}`]);
    push.mockClear();

    const openingsPath = `${trainerApi}/clients/${client}/openings`;
    const bookingPath = `${trainerApi}/clients/${client}/bookings`;
    const clientWeek = `${clientApi}?week=${date}`;
    expect((await call(otherTrainer, openingsPath)).status).toBe(403);
    expect((await call(otherTrainer, bookingPath, "POST", { startsAt: secondTime })).status).toBe(403);
    expect((await call(manager, bookingPath, "POST", { startsAt: secondTime })).status).toBe(403);
    const openings = await call(trainer, `${openingsPath}?week=${date}`);
    expect(openings.status).toBe(200);
    expect(openings.body.slots.filter((slot: { startsAt: string }) => ptLocalDate(new Date(slot.startsAt), timeZone) === date))
      .toHaveLength(24);
    expect((await call(manager, managerApi)).body.needsRebooking).toEqual([
      expect.objectContaining({ clientId: client })
    ]);
    expect((await call(otherManager, managerApi)).body.needsRebooking).toEqual([]);

    const request = await call(client, `${clientApi}/requests`, "POST", { trainerId: trainerProfile, startsAt: secondTime });
    expect(request.status).toBe(201);
    expect((await call(manager, managerApi)).body.needsRebooking).toEqual([]);
    const direct = await call(trainer, bookingPath, "POST", { startsAt: secondTime });
    expect(direct).toEqual({ status: 201, body: { id: request.body.id } });
    expect((await call(trainer, bookingPath, "POST", { startsAt: secondTime })).body.id).toBe(direct.body.id);
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: client }), expect.objectContaining({
      title: "Your PT booking is confirmed", href: "/pt-bookings"
    }));
    const beforeMove = await call(client, clientWeek);
    const initialUpdate = beforeMove.body.updates[0].id;
    const move = { id: direct.body.id, version: beforeMove.body.bookings[0].version };
    expect((await call(client, "/me")).body.user.pt_booking_update).toBe(true);
    expect((await call(peer, `${clientApi}/updates/${initialUpdate}`, "PATCH")).status).toBe(200);
    expect((await call(client, clientWeek)).body.updates).toHaveLength(1);

    expect((await call(trainer, `${trainerApi}/clients/${peer}/bookings`, "POST", { startsAt: firstTime })).status).toBe(201);
    expect((await call(trainer, bookingPath, "POST", { startsAt: firstTime, move })).status).toBe(409);
    expect((await call(client, clientWeek)).body.bookings[0].startsAt).toBe(new Date(secondTime).toISOString());
    expect(await call(trainer, bookingPath, "POST", { startsAt: thirdTime, move }))
      .toEqual({ status: 200, body: { id: direct.body.id } });
    expect((await call(trainer, bookingPath, "POST", { startsAt: thirdTime, move })).status).toBe(200);
    expect((await call(trainer, bookingPath, "POST", { startsAt: secondTime, move })).status).toBe(409);
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: client }), expect.objectContaining({
      title: "Your PT booking was moved", href: "/pt-bookings"
    }));
    const afterMove = await call(client, clientWeek);
    expect(afterMove.body.bookings).toEqual([expect.objectContaining({
      id: direct.body.id, startsAt: new Date(thirdTime).toISOString(), status: "confirmed"
    })]);
    expect(afterMove.body.updates).toEqual([expect.objectContaining({
      kind: "moved", startsAt: new Date(thirdTime).toISOString()
    })]);
    await call(client, `${clientApi}/updates/${initialUpdate}`, "PATCH");
    expect((await call(client, clientWeek)).body.updates).toHaveLength(1);
    await call(client, `${clientApi}/updates/${afterMove.body.updates[0].id}`, "PATCH");
    expect((await call(client, "/me")).body.user.pt_booking_update).toBe(false);
    expect((await call(client, clientWeek)).body.updates).toEqual([]);
    expect((await call(manager, managerApi)).body.needsRebooking).toEqual([]);
    expect((await call(client, `${clientApi}/requests/${direct.body.id}`, "PATCH", { action: "cancel", version: move.version })).status).toBe(409);
    expect((await call(client, `${clientApi}/requests/${direct.body.id}`, "PATCH", { action: "cancel" })).status).toBe(200);
    expect((await call(manager, managerApi)).body.needsRebooking).toEqual([expect.objectContaining({ clientId: client })]);
  });

  it("blocks lunch and leave, protects confirmed sessions, and restores availability on removal", async () => {
    await db.query("delete from pt_bookings where gym_id = $1", [gym]);
    const blocksPath = `${trainerApi}/blocks`;
    const request = (startsAt: string) => call(client, `${clientApi}/requests`, "POST", { trainerId: trainerProfile, startsAt });
    const local = (day: string, time: string) => `${day}T${time}:00+08:00`;
    const slotsOn = async (day: string) => {
      const response = await call(client, `${clientApi}?week=${day}`);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).not.toHaveProperty("blocks");
      return response.body.slots.filter((slot: { startsAt: string }) => ptLocalDate(new Date(slot.startsAt), timeZone) === day)
        .map((slot: { startsAt: string }) => slot.startsAt);
    };

    const lunch = { startsOn: date, endsOn: date, startsAt: "12:30", endsAt: "13:30", repeat: "daily" };
    const lunchRequest = await request(local(date, "12:00"));
    expect(lunchRequest.status).toBe(201);
    expect((await call(trainer, blocksPath, "POST", { ...lunch, endsAt: "11:00" })).status).toBe(400);
    expect((await call(client, blocksPath, "POST", lunch)).status).toBe(403);
    const saved = await call(trainer, blocksPath, "POST", lunch);
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(await call(trainer, blocksPath, "POST", lunch)).toEqual(saved);
    expect((await call(trainer, trainerApi)).body.blocks).toEqual([{ ...lunch, id: saved.body.id }]);
    expect((await call(manager, managerApi)).body).not.toHaveProperty("blocks");
    expect((await call(otherTrainer, `${blocksPath}/${saved.body.id}`, "DELETE")).status).toBe(404);
    expect((await call(client, `${clientApi}?week=${date}`)).body.bookings)
      .toContainEqual(expect.objectContaining({ id: lunchRequest.body.id, status: "declined" }));
    expect((await call(trainer, `${trainerApi}/requests/${lunchRequest.body.id}`, "PATCH", { action: "confirm" })).status).toBe(409);
    for (const day of [date, shiftPtDate(date, 1)]) {
      const slots = await slotsOn(day);
      expect(slots).toHaveLength(22);
      for (const time of ["12:00", "13:00"]) expect(slots).not.toContain(new Date(local(day, time)).toISOString());
      for (const time of ["11:00", "14:00"]) expect(slots).toContain(new Date(local(day, time)).toISOString());
    }
    expect((await request(local(date, "13:00"))).status).toBe(409);
    expect((await call(trainer, `${trainerApi}/clients/${client}/bookings`, "POST", { startsAt: local(date, "13:00") })).status).toBe(409);

    const confirmed = await request(firstTime);
    expect(confirmed.status).toBe(201);
    expect((await call(trainer, `${trainerApi}/requests/${confirmed.body.id}`, "PATCH", { action: "confirm" })).status).toBe(200);
    const leave = { startsOn: date, endsOn: shiftPtDate(date, 2), startsAt: null, endsAt: null, repeat: "none" };
    expect((await call(trainer, blocksPath, "POST", leave)).status).toBe(409);
    expect((await call(trainer, trainerApi)).body.blocks).toHaveLength(1);
    expect((await call(trainer, `${trainerApi}/requests/${confirmed.body.id}`, "PATCH", { action: "cancel" })).status).toBe(200);
    const savedLeave = await call(trainer, blocksPath, "POST", leave);
    expect(savedLeave.status, JSON.stringify(savedLeave.body)).toBe(201);
    for (const day of [date, shiftPtDate(date, 1), leave.endsOn]) expect(await slotsOn(day)).toEqual([]);
    expect(await slotsOn(shiftPtDate(date, 3))).toHaveLength(22);
    expect((await call(trainer, `${blocksPath}/${savedLeave.body.id}`, "DELETE")).status).toBe(200);

    const weekly = { ...lunch, startsAt: null, endsAt: null, repeat: "weekly" };
    const savedWeekly = await call(trainer, blocksPath, "POST", weekly);
    expect(savedWeekly.status, JSON.stringify(savedWeekly.body)).toBe(201);
    expect(await slotsOn(shiftPtDate(date, 7))).toEqual([]);
    expect(await slotsOn(shiftPtDate(date, 8))).toHaveLength(22);
    for (const id of [saved.body.id, savedWeekly.body.id]) {
      expect((await call(trainer, `${blocksPath}/${id}`, "DELETE")).status).toBe(200);
    }
    expect(await slotsOn(date)).toHaveLength(24);
    expect((await request(local(date, "13:00"))).status).toBe(201);
  });
});
