import express from "express";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { persistCompletedWorkoutMock, initializeWorkoutDebriefMock, generateWorkoutDebriefMock, queryMock, workoutCaptureAccessMock } = vi.hoisted(() => ({
  persistCompletedWorkoutMock: vi.fn(),
  initializeWorkoutDebriefMock: vi.fn(),
  generateWorkoutDebriefMock: vi.fn(),
  queryMock: vi.fn(),
  workoutCaptureAccessMock: vi.fn()
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
  requireActivePlan: () => (_req: any, _res: any, next: () => void) => next()
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
  getWorkoutDebrief: vi.fn()
}));

describe("workout debrief route isolation", () => {
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
    queryMock.mockReset();
    workoutCaptureAccessMock.mockReset().mockResolvedValue({ enabled: true, allowance: null });
  });

  afterAll(async () => closeServer?.());

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
    initializeWorkoutDebriefMock.mockResolvedValue({
      enabled: true,
      workoutEventId: "33333333-3333-4333-8333-333333333333",
      status: "pending",
      text: null,
      fallbackText: "Workout saved. Your session has been recorded.",
      source: null,
      cached: false
    });
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
