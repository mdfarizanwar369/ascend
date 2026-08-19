import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const readStoredImageMock = vi.fn();

vi.mock("../db/pool", () => ({ query: queryMock }));
vi.mock("../integrations/s3", () => ({
  createReadUrl: vi.fn(async () => null),
  readStoredImage: readStoredImageMock
}));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "11111111-1111-4111-8111-111111111111", primaryRole: "client", roles: ["client"] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/clientAccessService", () => ({ canManageClient: vi.fn(async () => false) }));
vi.mock("../services/coachPresenceService", () => ({ createCoachPresenceForEvent: vi.fn() }));

describe("progress photo image access", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { progressRouter } = await import("../routes/progress");
    const app = express();
    app.use(progressRouter);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected error" });
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    queryMock.mockReset();
    readStoredImageMock.mockReset();
  });

  afterAll(async () => closeServer?.());

  it("returns only the authenticated member's stored photo bytes", async () => {
    const photoId = "22222222-2222-4222-8222-222222222222";
    queryMock.mockResolvedValueOnce({ rows: [{ image_s3_key: "progress/member/photo.jpg" }] });
    readStoredImageMock.mockResolvedValueOnce({ buffer: Buffer.from([1, 2, 3]), contentType: "image/jpeg" });

    const response = await fetch(`${baseUrl}/progress-photos/${photoId}/image`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("where id = $1 and user_id = $2"), [
      photoId,
      "11111111-1111-4111-8111-111111111111"
    ]);
    expect(readStoredImageMock).toHaveBeenCalledWith("progress/member/photo.jpg");
  });

  it("does not expose a missing or different member's photo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const response = await fetch(`${baseUrl}/progress-photos/33333333-3333-4333-8333-333333333333/image`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Progress photo not found." });
    expect(readStoredImageMock).not.toHaveBeenCalled();
  });
});
