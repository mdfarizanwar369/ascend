import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appEditionMiddleware } from "../services/appEdition";

const { dailyForCompletion, premiumGate } = vi.hoisted(() => ({ dailyForCompletion: vi.fn(), premiumGate: vi.fn() }));
vi.mock("../services/iosDailyWorkoutService", () => ({ getIosWorkoutForCompletion: dailyForCompletion }));

const { persistCompletedWorkoutMock, initializeWorkoutDebriefMock, generateWorkoutDebriefMock, getWorkoutDebriefMock, queryMock, workoutCaptureAccessMock, debriefAccessMock, reserveDebriefMock } = vi.hoisted(() => ({
  persistCompletedWorkoutMock: vi.fn(),
  initializeWorkoutDebriefMock: vi.fn(),
  generateWorkoutDebriefMock: vi.fn(),
  getWorkoutDebriefMock: vi.fn(),
  queryMock: vi.fn(),
  workoutCaptureAccessMock: vi.fn(),
  debriefAccessMock: vi.fn(),
  reserveDebriefMock: vi.fn()
}));

vi.mock("../db/pool", () => ({ query: queryMock }));

vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: "11111111-1111-4111-8111-111111111111",
      gymId: null,
      primaryRole: "client",
      roles: ["client"],
      isPlatformOwner: false
    };
    next();
  }
}));
vi.mock("../middleware/subscription", () => ({
  requireActivePlan: () => (req: any, res: any, next: () => void) => premiumGate(req, res, next)
}));
vi.mock("../middleware/rateLimits", () => ({
  aiRateLimit: (_req: any, _res: any, next: () => void) => next(),
  uploadRateLimit: (_req: any, _res: any, next: () => void) => next(),
  workoutDebriefRateLimit: (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../services/workoutCompletionService", () => ({
  persistCompletedWorkout: persistCompletedWorkoutMock
}));
vi.mock("../services/workoutCaptureAccess", () => ({
  getWorkoutCaptureAccess: workoutCaptureAccessMock
}));
vi.mock("../services/workoutDebriefService", () => ({
  initializeWorkoutDebrief: initializeWorkoutDebriefMock,
  generateWorkoutDebrief: generateWorkoutDebriefMock,
  getWorkoutDebrief: getWorkoutDebriefMock
}));
vi.mock("../services/workoutDebriefAccessService", () => ({
  getWorkoutDebriefAccess: debriefAccessMock,
  reserveWorkoutDebriefGeneration: reserveDebriefMock,
  workoutDebriefIdentity: (input: unknown) => input
}));

describe("workout debrief route isolation", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const { logsRouter } = await import("../routes/logs");
    const app = express();
    app.use(express.json());
    app.use(appEditionMiddleware);
    app.use(logsRouter);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    dailyForCompletion.mockReset();
    premiumGate.mockReset().mockImplementation((_req, _res, next) => next());
    persistCompletedWorkoutMock.mockReset().mockResolvedValue({
      burnLog: {
        id: "33333333-3333-4333-8333-333333333333",
        metadata: { workoutTitle: "Upper Body Strength", workoutType: "Strength" },
        created_at: new Date().toISOString()
      },
      summary: {
        workoutTitle: "Upper Body Strength",
        durationMinutes: 40,
        workoutType: "Strength",
        difficulty: "Moderate",
        estimatedCaloriesBurned: 200,
        caloriesLabel: "Estimated Calories Burned",
        coachMessage: "Workout saved.",
        momentumEarned: 8,
        progression: null,
        progressionV3: null
      }
    });
    initializeWorkoutDebriefMock.mockReset().mockRejectedValue(new Error("Debrief storage unavailable"));
    generateWorkoutDebriefMock.mockReset();
    getWorkoutDebriefMock.mockReset();
    queryMock.mockReset();
    workoutCaptureAccessMock.mockReset().mockResolvedValue({ enabled: true, allowance: null });
    debriefAccessMock.mockReset().mockResolvedValue({
      tier: "premium",
      mode: "automatic",
      canGenerate: true,
      dailyLimit: 2,
      weeklyLimit: 10,
      dailyUsed: 0,
      weeklyUsed: 0,
      dailyRemaining: 2,
      weeklyRemaining: 10,
      nextWeeklyReviewAt: null
    });
    reserveDebriefMock.mockReset();
  });

  afterAll(async () => closeServer?.());

  it("lets native Free members save only their account-owned generated plan", async () => {
    const plan = {
      title: "Stored daily workout", focus: "Mobility", intensity: "easy", estimatedDurationMinutes: 20,
      exercises: [{ name: "Walk", duration: "10 minutes" }]
    };
    dailyForCompletion.mockResolvedValue({ workout: plan });
    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST", headers: { "content-type": "application/json", "X-Ascend-Edition": "ios-free-v1" },
      body: JSON.stringify({ workoutCompletionKey: "55555555-5555-4555-8555-555555555555",
        workoutTitle: "Caller supplied title", workoutType: "Strength", workoutDifficulty: "challenging",
        durationMinutes: 60, exercises: [{ name: "Caller supplied exercise", reps: "20" }] })
    });
    expect(response.status).toBe(201);
    expect(premiumGate).not.toHaveBeenCalled();
    expect(dailyForCompletion).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "55555555-5555-4555-8555-555555555555");
    expect(persistCompletedWorkoutMock).toHaveBeenCalledWith(expect.objectContaining({
      workoutTitle: plan.title, durationMinutes: 20, exercises: plan.exercises, workoutDifficulty: "easy"
    }));
  });

  it("rejects unknown or another account's daily workout key", async () => {
    dailyForCompletion.mockResolvedValue(null);
    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST", headers: { "content-type": "application/json", "X-Ascend-Edition": "ios-free-v1" },
      body: JSON.stringify({ workoutCompletionKey: "55555555-5555-4555-8555-555555555555",
        workoutTitle: "Workout", workoutType: "Strength", workoutDifficulty: "moderate",
        durationMinutes: 20, exercises: [{ name: "Squat", reps: "8" }] })
    });
    expect(response.status).toBe(404);
    expect(persistCompletedWorkoutMock).not.toHaveBeenCalled();
  });

  it("retains the Premium gate for other clients", async () => {
    premiumGate.mockImplementation((_req, res) => res.status(403).json({ error: "Premium required" }));
    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    });
    expect(response.status).toBe(403);
    expect(dailyForCompletion).not.toHaveBeenCalled();
    expect(persistCompletedWorkoutMock).not.toHaveBeenCalled();
  });

  it("returns the saved workout even when optional debrief initialization fails", async () => {
    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workoutCompletionKey: "55555555-5555-4555-8555-555555555555",
        workoutTitle: "Upper Body Strength",
        workoutType: "Strength",
        workoutDifficulty: "moderate",
        durationMinutes: 40,
        exercises: [{ name: "Dumbbell Press", sets: 3, reps: "10" }]
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      burnLog: { id: "33333333-3333-4333-8333-333333333333" },
      summary: { workoutTitle: "Upper Body Strength" },
      debrief: null
    });
    expect(persistCompletedWorkoutMock).toHaveBeenCalledTimes(1);
    expect(initializeWorkoutDebriefMock).toHaveBeenCalledTimes(1);
  });

  it("starts eligible generation on the server without delaying the saved-workout response", async () => {
    const available = {
      enabled: true,
      workoutEventId: "33333333-3333-4333-8333-333333333333",
      status: "available",
      text: null,
      fallbackText: "Workout saved. Your session has been recorded.",
      source: null,
      cached: false
    };
    initializeWorkoutDebriefMock.mockResolvedValue(available);
    const reservedAccess = { ...await debriefAccessMock(), dailyUsed: 1, weeklyUsed: 1, dailyRemaining: 1, weeklyRemaining: 9 };
    debriefAccessMock.mockResolvedValue(reservedAccess);
    reserveDebriefMock.mockResolvedValue({ outcome: "reserved", access: reservedAccess });
    getWorkoutDebriefMock.mockResolvedValue({ ...available, status: "pending" });
    generateWorkoutDebriefMock.mockImplementation(() => new Promise(() => undefined));

    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workoutCompletionKey: "66666666-6666-4666-8666-666666666666",
        workoutTitle: "Upper Body Strength",
        workoutType: "Strength",
        workoutDifficulty: "moderate",
        durationMinutes: 40,
        exercises: [{ name: "Dumbbell Press", sets: 3, reps: "10" }]
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      burnLog: { id: "33333333-3333-4333-8333-333333333333" },
      debrief: { status: "pending" }
    });
    expect(generateWorkoutDebriefMock).toHaveBeenCalledWith({
      workoutEventId: "33333333-3333-4333-8333-333333333333",
      userId: "11111111-1111-4111-8111-111111111111",
      gymId: null,
      isPlatformOwner: false
    });
    expect(reserveDebriefMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a Free workout selectable and does not start AI until the member chooses it", async () => {
    const freeAccess = {
      tier: "free",
      mode: "select_one",
      canGenerate: true,
      dailyLimit: null,
      weeklyLimit: 1,
      dailyUsed: 0,
      weeklyUsed: 0,
      dailyRemaining: null,
      weeklyRemaining: 1,
      nextWeeklyReviewAt: null
    };
    debriefAccessMock.mockResolvedValue(freeAccess);
    initializeWorkoutDebriefMock.mockResolvedValue({
      enabled: true,
      workoutEventId: "33333333-3333-4333-8333-333333333333",
      status: "available",
      text: null,
      fallbackText: "Workout saved.",
      source: null,
      cached: false
    });

    const response = await fetch(`${baseUrl}/burn-logs/completed-workout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workoutCompletionKey: "77777777-7777-4777-8777-777777777777",
        workoutTitle: "Upper Body Strength",
        workoutType: "Strength",
        workoutDifficulty: "moderate",
        durationMinutes: 40,
        exercises: [{ name: "Dumbbell Press", sets: 3, reps: "10" }]
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      debrief: { status: "available", access: { tier: "free", weeklyRemaining: 1 } }
    });
    expect(reserveDebriefMock).not.toHaveBeenCalled();
    expect(generateWorkoutDebriefMock).not.toHaveBeenCalled();
  });

  it("exposes terminal debrief status on recent detailed workouts without generating", async () => {
    queryMock.mockResolvedValue({
      rows: [{
        id: "33333333-3333-4333-8333-333333333333",
        metadata: { workoutTitle: "Upper Body Strength", exercises: [{ name: "Dumbbell Press" }] },
        created_at: new Date().toISOString(),
        debrief_status: "generated"
      }]
    });

    const response = await fetch(`${baseUrl}/burn-logs/detailed/recent?limit=3`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      workouts: [{ debrief_status: "generated" }]
    });
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("left join workout_debriefs");
    expect(generateWorkoutDebriefMock).not.toHaveBeenCalled();
  });
});
