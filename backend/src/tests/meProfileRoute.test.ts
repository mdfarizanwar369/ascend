import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));

vi.mock("../db/pool", () => ({ query: dbQuery }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: "11111111-1111-4111-8111-111111111111",
      primaryRole: "client",
      roles: ["client"],
      isPlatformOwner: false
    };
    next();
  }
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/rateLimits", () => ({ uploadRateLimit: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/userService", () => ({
  acknowledgeGoalMilestone: vi.fn(),
  completeOnboarding: vi.fn(),
  getGoalStatus: vi.fn(),
  guideProfileSchema: { parse: vi.fn() },
  onboardingSchema: { parse: vi.fn() },
  updateGuideProfile: vi.fn()
}));
vi.mock("../services/progressComparisonService", () => ({ getProgressComparison: vi.fn() }));
vi.mock("../integrations/s3", () => ({ createReadUrl: vi.fn(), deleteStoredObjects: vi.fn(), uploadDataUrl: vi.fn() }));
vi.mock("../services/profilePhotoService", () => ({ withProfilePhotoUrl: vi.fn((value) => value) }));
vi.mock("../services/bodyCompositionService", () => ({ bodyCompositionForNutrition: vi.fn(), bodyCompositionScanFromDb: vi.fn() }));
vi.mock("../services/accountDeletionService", () => ({ submitSelfAccountDeletion: vi.fn() }));
vi.mock("../services/nutritionTargetService", () => ({
  memberNutritionPreferenceSchema: { parse: vi.fn() },
  resolveNutritionTargets: vi.fn(),
  saveMemberNutritionPreference: vi.fn()
}));
vi.mock("../services/returnModeService", () => ({ claimReturnMode: vi.fn(), recordReturnModeContinued: vi.fn() }));
vi.mock("../config/env", () => ({ env: { BODY_SCAN_UNIVERSAL_OWNER_PREVIEW: false, BODY_SCAN_UNIVERSAL_PUBLIC: false, RETURN_MODE_V1: false } }));

describe("self-service profile name", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { meRouter } = await import("../routes/me");
    const app = express();
    app.use(express.json());
    app.use(meRouter);
    app.use((error: any, _req: any, res: any, _next: any) => {
      res.status(error?.name === "ZodError" ? 400 : 500).json({ error: error?.message ?? "Unexpected error" });
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => dbQuery.mockReset());
  afterAll(async () => closeServer?.());

  it("updates only the authenticated user's name and supports a one-character Chinese name", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ id: "11111111-1111-4111-8111-111111111111", full_name: "李", email: "member@example.com" }]
    });

    const response = await fetch(`${baseUrl}/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "  李  " })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "11111111-1111-4111-8111-111111111111", full_name: "李", email: "member@example.com" }
    });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("where id = $1 and status = 'active'"), [
      "11111111-1111-4111-8111-111111111111",
      "李"
    ]);
  });

  it("rejects an empty name before querying the database", async () => {
    const response = await fetch(`${baseUrl}/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "   " })
    });

    expect(response.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("rejects control characters in a name", async () => {
    const response = await fetch(`${baseUrl}/me/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Member\nName" })
    });

    expect(response.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });
});
