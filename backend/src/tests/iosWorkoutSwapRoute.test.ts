import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usesDailyWorkout: vi.fn(),
  swap: vi.fn()
}));

vi.mock("../config/env", () => ({ env: {
  AI_PROVIDER: "gemini", MOMENTUM_V2: false,
  COACH_ZOE_WORKOUT_ENGINE_V2: false, COACH_ZOE_WORKOUT_ENGINE_V2_OWNER_PILOT: false
} }));
vi.mock("../middleware/auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => {
  req.user = { id: "11111111-1111-4111-8111-111111111111", isPlatformOwner: false };
  next();
} }));
vi.mock("../middleware/rateLimits", () => ({
  aiRateLimit: (_req: any, _res: any, next: () => void) => next(),
  todayPriorityRateLimit: (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/aiUsageService", () => ({
  usesIosDailyWorkout: mocks.usesDailyWorkout,
  getCoachZoeAccess: vi.fn(), logAiUsage: vi.fn()
}));
vi.mock("../services/iosDailyWorkoutService", () => ({
  swapIosDailyWorkoutExercise: mocks.swap,
  getIosDailyWorkout: vi.fn(), generateIosDailyWorkout: vi.fn()
}));

describe("saved iPhone workout swaps after rollout rollback", () => {
  const completionKey = "22222222-2222-4222-8222-222222222222";
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { aiRouter } = await import("../routes/ai");
    const app = express();
    app.use(express.json());
    app.use(aiRouter);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usesDailyWorkout.mockResolvedValue(true);
    mocks.swap.mockResolvedValue({ workoutCompletionKey: completionKey, workout: { experienceVersion: 2 } });
  });
  afterAll(async () => closeServer?.());

  it("still swaps an account-owned saved V2 workout when both rollout flags are off", async () => {
    const response = await fetch(`${baseUrl}/ai/workout/today/swap`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutCompletionKey: completionKey, exerciseIndex: 0 })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dailyWorkout: { workout: { experienceVersion: 2 } } });
    expect(mocks.swap).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", completionKey, 0);
  });

  it("keeps the route unavailable for accounts without a daily workout allowance", async () => {
    mocks.usesDailyWorkout.mockResolvedValue(false);
    const response = await fetch(`${baseUrl}/ai/workout/today/swap`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutCompletionKey: completionKey, exerciseIndex: 0 })
    });
    expect(response.status).toBe(404);
    expect(mocks.swap).not.toHaveBeenCalled();
  });
});
