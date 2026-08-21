import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../db/pool", () => ({
  query: queryMock,
  pool: { connect: vi.fn() }
}));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "11111111-1111-4111-8111-111111111111", primaryRole: "owner", roles: ["owner"] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../services/adminScopeService", () => ({
  getAdminGymScope: vi.fn(async () => ({ gymIds: ["22222222-2222-4222-8222-222222222222"], isPlatformOwner: false })),
  getUserGymId: vi.fn(async () => "22222222-2222-4222-8222-222222222222"),
  getTrainerGymId: vi.fn(),
  scopeAllowsGym: vi.fn(() => true)
}));
vi.mock("../services/analyticsService", () => ({ getRevenueByGym: vi.fn(), getRevenueByTrainer: vi.fn() }));
vi.mock("../services/aiUsageService", () => ({ aiLimitConfig: vi.fn(() => ({ monthlySpendLimitCents: 1 })) }));
vi.mock("../services/dailyCoachingDecisionService", () => ({ getDailyCoachingRolloutMetrics: vi.fn() }));
vi.mock("../integrations/firebase", () => ({ getFirebaseAuth: vi.fn() }));
vi.mock("../integrations/s3", () => ({ deleteStoredObjects: vi.fn() }));

describe("admin subscription safety", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  const userId = "33333333-3333-4333-8333-333333333333";

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

  beforeEach(() => queryMock.mockReset());
  afterAll(async () => closeServer?.());

  it("refuses to overwrite live Google Play access with a manual plan", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ referred_by_gym_id: null, referred_by_trainer_id: null }] })
      .mockResolvedValueOnce({ rows: [{ provider: "google_play" }] });

    const response = await fetch(`${baseUrl}/admin/users/${userId}/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("google play") });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("cancels only old manual access before creating new manual access", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ referred_by_gym_id: null, referred_by_trainer_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-1", plan: "premium", provider: "manual" }] });

    const response = await fetch(`${baseUrl}/admin/users/${userId}/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" })
    });

    expect(response.status).toBe(201);
    const cancellationSql = String(queryMock.mock.calls[2]?.[0] ?? "");
    expect(cancellationSql).toContain("provider = 'manual'");
    expect(cancellationSql).not.toContain("provider <> 'manual'");
  });
});
