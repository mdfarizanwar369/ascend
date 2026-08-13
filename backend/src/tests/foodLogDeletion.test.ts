import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const deleteStoredObjectsMock = vi.fn(async () => undefined);

vi.mock("../db/pool", () => ({ query: queryMock }));
vi.mock("../integrations/s3", () => ({
  createReadUrl: vi.fn(async () => null),
  createUploadUrl: vi.fn(),
  uploadDataUrl: vi.fn(),
  deleteStoredObjects: deleteStoredObjectsMock
}));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "11111111-1111-4111-8111-111111111111", primaryRole: "client", roles: ["client"] };
    next();
  }
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/rateLimits", () => ({
  aiRateLimit: (_req: any, _res: any, next: () => void) => next(),
  uploadRateLimit: (_req: any, _res: any, next: () => void) => next()
}));

describe("food log deletion", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { logsRouter } = await import("../routes/logs");
    const app = express();
    app.use(express.json());
    app.use(logsRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    queryMock.mockReset();
    deleteStoredObjectsMock.mockClear();
  });

  afterAll(async () => closeServer?.());

  it("deletes only the authenticated member's meal and removes its stored image", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "22222222-2222-4222-8222-222222222222", image_s3_key: "food/member/photo.jpg" }] });

    const response = await fetch(`${baseUrl}/food-logs/22222222-2222-4222-8222-222222222222`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("where id = $1 and user_id = $2"), [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(deleteStoredObjectsMock).toHaveBeenCalledWith(["food/member/photo.jpg"]);
  });

  it("returns not found when the meal does not belong to the authenticated member", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/food-logs/33333333-3333-4333-8333-333333333333`, { method: "DELETE" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Meal not found." });
    expect(deleteStoredObjectsMock).not.toHaveBeenCalled();
  });
});
