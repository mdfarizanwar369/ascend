import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: "client-1",
      firebaseUid: "firebase-client-1",
      email: "client@example.com",
      primaryRole: "client",
      roles: ["client"],
      isPlatformOwner: false
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next()
}));

vi.mock("../middleware/subscription", () => ({
  requireActivePlan: () => (_req: any, _res: any, next: () => void) => next()
}));

vi.mock("../services/clientAccessService", () => ({
  canManageClient: vi.fn(async () => true)
}));

vi.mock("../services/trainerHomeworkService", () => ({
  trainerHomeworkEnabled: vi.fn(() => false),
  generateTrainerHomeworkPreview: vi.fn(),
  getTrainerHomeworkHistory: vi.fn(),
  assignTrainerHomework: vi.fn(),
  getCurrentClientHomework: vi.fn(),
  getClientHomeworkById: vi.fn(),
  completeTrainerHomework: vi.fn(),
  notifyHomeworkAssigned: vi.fn()
}));

describe("trainer homework route fallback", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { trainerHomeworkRouter } = await import("../routes/trainerHomework");
    const app = express();
    app.use(express.json());
    app.use(trainerHomeworkRouter);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
  });

  afterAll(async () => {
    await closeServer?.();
  });

  it("returns an empty trainer history payload when the feature is disabled", async () => {
    const response = await fetch(`${baseUrl}/trainer/clients/client-1/homework`, {
      headers: { Authorization: "Bearer test-token" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      assignments: [],
      summary: {
        assigned: 0,
        completed: 0,
        missed: 0
      },
      disabled: true
    });
  });

  it("returns a null current homework payload when the feature is disabled", async () => {
    const response = await fetch(`${baseUrl}/me/coach-homework/current`, {
      headers: { Authorization: "Bearer test-token" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      assignment: null,
      disabled: true
    });
  });

  it("no-ops trainer homework mutations when the feature is disabled", async () => {
    const response = await fetch(`${baseUrl}/trainer/clients/client-1/homework/generate`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workout: null,
      disabled: true
    });
  });
});
