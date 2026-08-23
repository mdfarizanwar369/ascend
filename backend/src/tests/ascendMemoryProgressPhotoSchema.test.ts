import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const queryMock = vi.fn();

vi.mock("../db/pool", () => ({ query: queryMock }));
vi.mock("../integrations/openai", () => ({ createAscendMemoryReflection: vi.fn() }));
vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: userId, primaryRole: "client", roles: ["client"] };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/clientAccessService", () => ({ canManageClient: vi.fn(async () => false) }));

function useProductionProgressPhotoSchema(photoRows: Array<{ logged_at: string }>) {
  queryMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from users u") && normalized.includes("active_subscription")) {
      return {
        rows: [{
          id: userId,
          full_name: "Memory Member",
          email: "memory@example.com",
          goal_type: "general_fitness",
          starting_weight_kg: null,
          target_weight_kg: null,
          gym_id: null,
          athlete_mode_enabled: false,
          current_plan: "free",
          subscription_status: null,
          created_at: "2026-01-01T00:00:00.000Z"
        }]
      };
    }

    if (normalized.includes("from progress_photos")) {
      if (/\bimage_url\b/.test(normalized)) {
        throw Object.assign(new Error("column image_url does not exist"), { code: "42703" });
      }
      expect(values).toEqual([userId]);
      return { rows: photoRows };
    }

    return { rows: [] };
  });
}

describe("Ascend Memory progress photo schema compatibility", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { memoryRouter } = await import("../routes/memory");
    const app = express();
    app.use(memoryRouter);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
      res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected error", code });
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    queryMock.mockReset();
  });

  afterAll(async () => closeServer?.());

  it("returns a valid Memory timeline for a member with a progress photo", async () => {
    useProductionProgressPhotoSchema([{ logged_at: "2026-06-15T10:30:00.000Z" }]);

    const response = await fetch(`${baseUrl}/memory/me`);
    const body = await response.json() as {
      access: string;
      timeline: Array<{ type: string; occurredAt: string; metadata?: Record<string, unknown> }>;
      stats: { monthlyLimit: number };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ access: "free", stats: { monthlyLimit: 4 } });
    expect(body.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "first_photo",
        occurredAt: "2026-06-15T10:30:00.000Z",
        metadata: { totalPhotos: 1 }
      })
    ]));
    expect(JSON.stringify(body)).not.toContain("image_s3_key");
    expect(JSON.stringify(body)).not.toContain("image_url");
  });

  it("returns a valid Memory timeline when the member has no progress photos", async () => {
    useProductionProgressPhotoSchema([]);

    const response = await fetch(`${baseUrl}/memory/me`);
    const body = await response.json() as { timeline: Array<{ type: string }> };

    expect(response.status).toBe(200);
    expect(body.timeline.some((item) => item.type === "first_photo")).toBe(false);
    expect(body.timeline.some((item) => item.type === "started_journey")).toBe(true);
  });
});
