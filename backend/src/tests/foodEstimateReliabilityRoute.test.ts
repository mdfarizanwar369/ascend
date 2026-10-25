import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/errors";

const estimateImage = vi.fn();
const estimateText = vi.fn();
const getAllowance = vi.fn();

vi.mock("../db/pool", () => ({ query: vi.fn(), pool: {} }));
vi.mock("../integrations/openai", () => ({
  estimateFoodFromImage: estimateImage,
  estimateFoodFromText: estimateText,
  createWorkoutDebriefProviderReply: vi.fn()
}));
vi.mock("../services/aiUsageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/aiUsageService")>()),
  getFoodAiAllowance: getAllowance
}));
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

const estimate = {
  foodName: "Banana",
  confidence: 0.8,
  calories: 105,
  proteinG: 1,
  carbsG: 27,
  fatG: 0,
  notes: "One banana"
};

describe("food estimate route reliability", () => {
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
  beforeEach(() => {
    estimateImage.mockReset().mockResolvedValue(estimate);
    estimateText.mockReset().mockResolvedValue(estimate);
    getAllowance.mockReset();
  });

  async function post(route: string, body: unknown) {
    return fetch(`${base}/food-logs/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it.each([
    ["estimate", { imageUrl: "https://8.8.8.8/photo.jpg" }],
    ["estimate-data-url", { imageDataUrl: "data:image/jpeg;base64,/9j/2Q==" }],
    ["estimate-text", { description: "one banana" }]
  ])("keeps the %s estimate when the optional allowance refresh fails", async (route, body) => {
    getAllowance.mockRejectedValueOnce(new Error("private database details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await post(route, body);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ estimate });
      expect(log).toHaveBeenCalledWith("[food-ai-route]", {
        route: route === "estimate" ? "image-url" : route === "estimate-data-url" ? "image-data-url" : "text",
        stage: "allowance_refresh",
        category: "unexpected"
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private database details");
    } finally {
      log.mockRestore();
    }
  });

  it("returns an estimate within the allowance deadline and handles a late rejection", async () => {
    let rejectAllowance: (error: Error) => void = () => undefined;
    getAllowance.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectAllowance = reject; }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await post("estimate-text", { description: "one banana" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ estimate });
      expect(log).toHaveBeenCalledWith("[food-ai-route]", {
        route: "text", stage: "allowance_refresh", category: "timeout"
      });

      rejectAllowance(new Error("late private database details"));
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(JSON.stringify(log.mock.calls)).not.toContain("private database details");
    } finally {
      log.mockRestore();
    }
  });

  it("caps timed-out optional lookups so they cannot occupy the full database pool", async () => {
    const { env } = await import("../config/env");
    const limit = Math.max(1, Math.floor(env.DATABASE_POOL_MAX / 4));
    const finishLookup: Array<() => void> = [];
    getAllowance.mockImplementation(() => new Promise(resolve => {
      finishLookup.push(() => resolve({ period: "day", label: "Free", limit: 2, used: 1, remaining: 1 }));
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const pendingResponses = Array.from({ length: limit }, () => post("estimate-text", { description: "one banana" }));
      await vi.waitFor(() => expect(getAllowance).toHaveBeenCalledTimes(limit));

      const extra = await post("estimate-text", { description: "one banana" });
      expect(extra.status).toBe(200);
      expect(await extra.json()).toEqual({ estimate });
      expect(getAllowance).toHaveBeenCalledTimes(limit);
      expect(log).toHaveBeenCalledWith("[food-ai-route]", {
        route: "text", stage: "allowance_refresh", category: "busy"
      });

      const waiting = await Promise.all(pendingResponses);
      expect(waiting.every(response => response.status === 200)).toBe(true);
    } finally {
      finishLookup.forEach(finish => finish());
      await new Promise<void>(resolve => setImmediate(resolve));
      log.mockRestore();
    }
  });

  it.each([
    ["estimate", { imageUrl: "not-a-url" }],
    ["estimate-data-url", { imageDataUrl: "not-an-image" }],
    ["estimate-text", { description: "x" }]
  ])("returns a validation 400 for invalid %s input without calling AI", async (route, body) => {
    const response = await post(route, body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid request");
    expect(estimateImage).not.toHaveBeenCalled();
    expect(estimateText).not.toHaveBeenCalled();
    expect(getAllowance).not.toHaveBeenCalled();
  });

  it("logs a sanitized category and route for a provider failure", async () => {
    estimateImage.mockRejectedValueOnce(Object.assign(new Error("private provider body"), { category: "request_rejected" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await post("estimate-data-url", { imageDataUrl: "data:image/jpeg;base64,/9j/2Q==" });
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe("Food AI estimate is temporarily unavailable.");
      expect(log).toHaveBeenCalledWith("[food-ai-route]", {
        route: "image-data-url", stage: "analysis", category: "request_rejected"
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private provider body");
    } finally {
      log.mockRestore();
    }
  });
});
