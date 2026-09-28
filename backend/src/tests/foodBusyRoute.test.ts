import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AiWorkBusyError } from "../services/aiWorkLeaseService";
import { errorHandler } from "../middleware/errors";

const estimate = vi.fn();
vi.mock("../db/pool", () => ({ query: vi.fn(), pool: {} }));
vi.mock("../integrations/openai", () => ({ estimateFoodFromImage: estimate, estimateFoodFromText: estimate, createWorkoutDebriefProviderReply: vi.fn() }));
vi.mock("../middleware/auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => {
  req.user = { id: "11111111-1111-4111-8111-111111111111", primaryRole: "client", roles: ["client"] }; next();
} }));
vi.mock("../middleware/aiConsent", () => ({ requireAiConsent: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/rateLimits", () => ({
  aiRateLimit: (_req: any, _res: any, next: () => void) => next(),
  uploadRateLimit: (_req: any, _res: any, next: () => void) => next(),
  workoutDebriefRateLimit: (_req: any, _res: any, next: () => void) => next()
}));

describe("food estimate busy responses", () => {
  let base = "", close: () => Promise<void>;
  beforeAll(async () => {
    const { logsRouter } = await import("../routes/logs");
    const app = express(); app.use(express.json()); app.use(logsRouter); app.use(errorHandler);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  afterAll(async () => close?.());
  it.each([
    ["estimate-text", { description: "one banana" }],
    ["estimate-data-url", { imageDataUrl: "data:image/jpeg;base64,/9j/2Q==" }],
    ["estimate", { imageUrl: "https://8.8.8.8/photo.jpg" }]
  ])("returns a retryable 429 for %s when work is already reserved", async (route, body) => {
    estimate.mockRejectedValueOnce(new AiWorkBusyError());
    const response = await fetch(`${base}/food-logs/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
    expect((await response.json()).error).toContain("already working");
  });
});
