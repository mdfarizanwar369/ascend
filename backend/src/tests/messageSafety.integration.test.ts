import express from "express";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as any, user: null as any, notify: vi.fn(), plan: vi.fn() }));
vi.mock("../db/pool", () => ({
  query: (...args: any[]) => state.client.query(...args),
  pool: { connect: async () => ({ query: (...args: any[]) => state.client.query(...args), release: () => {} }) }
}));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => { req.user = state.user; next(); },
  requirePlatformOwner: (req: any, res: any, next: () => void) => req.user.isPlatformOwner ? next() : res.sendStatus(403)
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => { state.plan(); next(); } }));
vi.mock("../services/notificationService", () => ({ notifyHumanCoachEvent: state.notify }));
vi.mock("../services/profilePhotoService", () => ({ withProfilePhotoUrls: (rows: any) => rows }));
vi.mock("../services/adminScopeService", () => ({ getAdminGymScope: async () => ({ gymIds: [] }) }));
vi.mock("../services/clientAccessService", () => ({ canManageClient: async (_user: any, id: string) => id === "11111111-1111-4111-8111-111111111111" }));

// Run against an explicitly supplied PostgreSQL connection. All data lives in a random,
// temporary schema; no production users, messages, or schema migrations are touched.
describe.skipIf(!process.env.MESSAGE_SAFETY_DATABASE_URL)("message safety with PostgreSQL", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  const trainerUserId = "22222222-2222-4222-8222-222222222222";
  const strangerId = "33333333-3333-4333-8333-333333333333";
  const trainerId = "44444444-4444-4444-8444-444444444444";
  const messageId = "55555555-5555-4555-8555-555555555555";
  const schema = `message_safety_test_${randomUUID().replaceAll("-", "")}`;
  let url = "";
  let close: () => Promise<void>;
  const asClient = () => { state.user = { id: clientId, roles: ["client"], primaryRole: "client", email: "fixture@example.test", isPlatformOwner: false }; };
  const asTrainer = () => { state.user = { id: trainerUserId, trainerId, roles: ["trainer"], primaryRole: "trainer", email: "trainer@example.test", isPlatformOwner: false }; };
  const request = (route: string, method = "GET", body?: object) => fetch(`${url}${route}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const report = async () => (await (await request(`/messages/${messageId}/report`, "POST", { reason: "harassment", details: "Review fixture" })).json()).report.id as string;

  beforeAll(async () => {
    state.client = new Client({ connectionString: process.env.MESSAGE_SAFETY_DATABASE_URL });
    await state.client.connect();
    await state.client.query(`create schema ${schema}`);
    await state.client.query(`set search_path to ${schema}, public`);
    await state.client.query(`create table users (id uuid primary key, full_name text, status text default 'active', gym_id uuid, assigned_trainer_id uuid);
      create table trainers (id uuid primary key, user_id uuid references users(id));
      create table messages (id uuid primary key default uuid_generate_v4(), sender_user_id uuid references users(id), receiver_user_id uuid references users(id), body text, created_at timestamptz default now(), read_at timestamptz);`);
    await state.client.query(await readFile(path.resolve("migrations/036_message_safety.sql"), "utf8"));
    const { messagesRouter } = await import("../routes/messages");
    const { errorHandler } = await import("../middleware/errors");
    const app = express(); app.use(express.json()); app.use(messagesRouter); app.use(errorHandler);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  beforeEach(async () => {
    await state.client.query("truncate message_blocks, message_reports, message_restrictions, messages, trainers, users cascade");
    await state.client.query("insert into users (id, full_name, assigned_trainer_id) values ($1, 'Client fixture', $4), ($2, 'Trainer fixture', null), ($3, 'Unrelated fixture', null)", [clientId, trainerUserId, strangerId, trainerId]);
    await state.client.query("insert into trainers (id, user_id) values ($1, $2)", [trainerId, trainerUserId]);
    await state.client.query("insert into messages (id, sender_user_id, receiver_user_id, body) values ($1, $2, $3, 'Original fixture message')", [messageId, trainerUserId, clientId]);
    asClient(); state.notify.mockClear(); state.plan.mockClear();
  });
  afterAll(async () => {
    await close?.();
    if (state.client) {
      if (!/^message_safety_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Unexpected test schema");
      await state.client.query(`drop schema if exists ${schema} cascade`);
      await state.client.end();
    }
  });

  it("persists blocks and prevents sending in either direction, including trainer quick reply", async () => {
    expect((await request(`/messages/contacts/${trainerUserId}/block`, "PUT", { blocked: true })).status).toBe(200);
    expect(await (await request(`/messages/contacts/${trainerUserId}/safety`)).json()).toEqual({ blockedByMe: true, canSend: false });
    expect((await request("/messages", "POST", { receiverUserId: trainerUserId, body: "Must not send" })).status).toBe(403);
    asTrainer();
    expect((await request("/messages", "POST", { receiverUserId: clientId, body: "Must not send" })).status).toBe(403);
    expect((await request(`/trainer/clients/${clientId}/messages`, "POST", { body: "Must not send" })).status).toBe(403);
    expect((await state.client.query("select count(*)::int as n from messages")).rows[0].n).toBe(1);
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("only removes the caller's block, preserving the other person's choice", async () => {
    await request(`/messages/contacts/${trainerUserId}/block`, "PUT", { blocked: true });
    asTrainer(); await request(`/messages/contacts/${clientId}/block`, "PUT", { blocked: true });
    asClient();
    expect(await (await request(`/messages/contacts/${trainerUserId}/block`, "PUT", { blocked: false })).json()).toEqual({ blockedByMe: false, canSend: false });
    asTrainer(); await request(`/messages/contacts/${clientId}/block`, "PUT", { blocked: false });
    expect((await request(`/trainer/clients/${clientId}/messages`, "POST", { body: "Allowed again" })).status).toBe(201);
    expect(state.notify).toHaveBeenCalledOnce();
  });
  it("allows reporting received messages without a plan and deduplicates repeat reports", async () => {
    const id = await report(); expect(await report()).toBe(id);
    expect(state.plan).not.toHaveBeenCalled();
    const rows = (await state.client.query("select * from message_reports")).rows;
    expect(rows).toHaveLength(1); expect(rows[0].message_body).toBe("Original fixture message");
  });
  it("refuses reports about another person's message or one's own message", async () => {
    state.user.id = strangerId;
    expect((await request(`/messages/${messageId}/report`, "POST", { reason: "spam" })).status).toBe(404);
    asTrainer();
    expect((await request(`/messages/${messageId}/report`, "POST", { reason: "spam" })).status).toBe(404);
  });
  it("validates reports and refuses safety operations against unrelated users", async () => {
    expect((await request(`/messages/${messageId}/report`, "POST", { reason: "invalid" })).status).toBe(400);
    expect((await request(`/messages/contacts/${strangerId}/block`, "PUT", { blocked: true })).status).toBe(404);
    expect((await request(`/messages/contacts/${clientId}/block`, "PUT", { blocked: true })).status).toBe(404);
  });
  it("keeps safety actions available after trainer reassignment", async () => {
    await state.client.query("update users set assigned_trainer_id = null where id = $1", [clientId]);
    expect((await request(`/messages/contacts/${trainerUserId}/block`, "PUT", { blocked: true })).status).toBe(200);
    expect((await request(`/messages/${messageId}/report`, "POST", { reason: "harassment" })).status).toBe(201);
  });
  it("keeps private reports away from clients, trainers, and gym owners", async () => {
    const id = await report();
    for (const role of ["client", "trainer", "owner", "admin"]) {
      state.user.roles = [role];
      expect((await request("/moderation/messages")).status).toBe(403);
      expect((await request(`/moderation/messages/${id}/resolve`, "POST", { action: "dismiss" })).status).toBe(403);
    }
  });
  it("lets the platform moderator remove a message and restrict the sender", async () => {
    const id = await report(); state.user.isPlatformOwner = true;
    expect((await (await request("/moderation/messages")).json()).reports).toHaveLength(1);
    expect((await request(`/moderation/messages/${id}/resolve`, "POST", { action: "restrict" })).status).toBe(200);
    expect((await state.client.query("select body from messages where id = $1", [messageId])).rows[0].body).toBe("[Message removed by Ascend]");
    expect((await state.client.query("select status from message_reports where id = $1", [id])).rows[0].status).toBe("restricted");
    asTrainer();
    expect((await request(`/trainer/clients/${clientId}/messages`, "POST", { body: "Must not send" })).status).toBe(403);
  });
  it("dismisses a report without changing the conversation", async () => {
    const id = await report(); state.user.isPlatformOwner = true;
    expect((await request(`/moderation/messages/${id}/resolve`, "POST", { action: "dismiss" })).status).toBe(200);
    expect((await state.client.query("select body from messages where id = $1", [messageId])).rows[0].body).toBe("Original fixture message");
    expect((await request(`/moderation/messages/${id}/resolve`, "POST", { action: "remove" })).status).toBe(404);
  });
});
