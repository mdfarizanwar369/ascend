import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  getAdminGymScope: vi.fn(),
  getUserGymId: vi.fn(),
  getTrainerGymId: vi.fn(),
  scopeAllowsGym: vi.fn(),
  setLegacyAssignment: vi.fn()
}));

vi.mock("../db/pool", () => ({
  query: mocks.query,
  pool: { connect: mocks.connect }
}));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: "11111111-1111-4111-8111-111111111111",
      primaryRole: "owner",
      roles: ["owner", "admin", "trainer"],
      isPlatformOwner: true
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../services/adminScopeService", () => ({
  getAdminGymScope: mocks.getAdminGymScope,
  getUserGymId: mocks.getUserGymId,
  getTrainerGymId: mocks.getTrainerGymId,
  scopeAllowsGym: mocks.scopeAllowsGym
}));
vi.mock("../services/ascendCoachRelationshipService", () => ({
  setLegacyAdminCoachAssignment: mocks.setLegacyAssignment
}));
vi.mock("../services/analyticsService", () => ({ getRevenueByGym: vi.fn(), getRevenueByTrainer: vi.fn() }));
vi.mock("../services/aiUsageService", () => ({ aiLimitConfig: vi.fn(() => ({ monthlySpendLimitCents: 1 })) }));
vi.mock("../services/dailyCoachingDecisionService", () => ({ getDailyCoachingRolloutMetrics: vi.fn() }));
vi.mock("../integrations/firebase", () => ({ getFirebaseAuth: vi.fn() }));
vi.mock("../integrations/s3", () => ({ deleteStoredObjects: vi.fn() }));

describe("Business account and trainer management", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  const clientId = "22222222-2222-4222-8222-222222222222";
  const trainerId = "33333333-3333-4333-8333-333333333333";
  const gymId = "44444444-4444-4444-8444-444444444444";

  beforeAll(async () => {
    const { adminRouter } = await import("../routes/admin");
    const app = express();
    app.use(express.json());
    app.use(adminRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminGymScope.mockResolvedValue({ gymIds: null, isPlatformOwner: true });
    mocks.getUserGymId.mockResolvedValue(gymId);
    mocks.getTrainerGymId.mockResolvedValue(gymId);
    mocks.scopeAllowsGym.mockReturnValue(true);
  });

  afterAll(async () => closeServer?.());

  it("restores the audited admin assignment path while Ascend Coach is enabled", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ has_access: true }] });
    mocks.setLegacyAssignment.mockResolvedValue({ id: clientId, assigned_trainer_id: trainerId });

    const response = await fetch(`${baseUrl}/admin/assign-client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, trainerId })
    });

    expect(response.status).toBe(200);
    expect(mocks.setLegacyAssignment).toHaveBeenCalledWith(expect.objectContaining({ clientUserId: clientId, trainerId }));
  });

  it("lets the Platform Owner assign a gym and edit a member name", async () => {
    const dbQuery = vi.fn((sql: string) => {
      if (sql === "begin" || sql === "commit" || sql === "rollback") return Promise.resolve({ rows: [] });
      if (sql.includes("from users user_row")) {
        return Promise.resolve({ rows: [{ id: clientId, gym_id: null, trainer_id: null, primary_role: "client" }] });
      }
      if (sql.includes("from trainer_client_relationships relationship")) {
        return Promise.resolve({ rows: [{ conflicting: false }] });
      }
      if (sql.includes("update users")) {
        return Promise.resolve({ rows: [{ id: clientId, full_name: "Updated Member", gym_id: gymId, status: "active" }] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mocks.connect.mockResolvedValue({ query: dbQuery, release: vi.fn() });

    const response = await fetch(`${baseUrl}/admin/users/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Updated Member", gymId })
    });

    expect(response.status).toBe(200);
    expect(dbQuery.mock.calls.some(([sql]) => String(sql).includes("set full_name = $2, gym_id = $3"))).toBe(true);
  });

  it("blocks a gym move that would cross an open coaching relationship", async () => {
    const dbQuery = vi.fn((sql: string) => {
      if (sql === "begin" || sql === "rollback") return Promise.resolve({ rows: [] });
      if (sql.includes("from users user_row")) {
        return Promise.resolve({ rows: [{ id: clientId, gym_id: null, trainer_id: null, primary_role: "client" }] });
      }
      if (sql.includes("from trainer_client_relationships relationship")) {
        return Promise.resolve({ rows: [{ conflicting: true }] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mocks.connect.mockResolvedValue({ query: dbQuery, release: vi.fn() });

    const response = await fetch(`${baseUrl}/admin/users/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Member", gymId })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("coach relationship") });
  });
});
