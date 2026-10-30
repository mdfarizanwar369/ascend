import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/errors";

const mocks = vi.hoisted(() => ({
  platformOwner: false,
  primaryRole: "client",
  flag: false,
  schema: true,
  workoutV2: true,
  query: vi.fn(),
  getProgramme: vi.fn(),
  setStatus: vi.fn(),
  getWorkout: vi.fn(),
  getForCompletion: vi.fn(),
  generateProgramme: vi.fn(),
  dismissProgramme: vi.fn(),
  swapProgramme: vi.fn(),
  completeProgramme: vi.fn(),
  usesDaily: vi.fn(),
  legacyToday: vi.fn(),
  legacyCompletion: vi.fn(),
  legacyGenerate: vi.fn(),
  persistCompletion: vi.fn(),
  initializeDebrief: vi.fn(),
  createPlan: vi.fn(),
  logUsage: vi.fn()
}));

vi.mock("../db/pool", () => ({ query: mocks.query, pool: {} }));
vi.mock("../config/env", () => ({ env: {
  AI_PROVIDER: "gemini", MOMENTUM_V2: false,
  get COACH_ZOE_WORKOUT_ENGINE_V2() { return mocks.workoutV2; },
  COACH_ZOE_WORKOUT_ENGINE_V2_OWNER_PILOT: false,
  EXERCISE_VISUALS_ENABLED: false, EXERCISE_VISUALS_USER_IDS: "",
  get ZOE_BEGINNER_PROGRAMME_SCHEMA() { return mocks.schema; },
  get ZOE_BEGINNER_PROGRAMME_OWNER_PILOT() { return mocks.flag; }
} }));
vi.mock("../middleware/auth", () => ({ requireAuth: (req: any, _res: any, next: () => void) => {
  req.user = {
    id: "11111111-1111-4111-8111-111111111111",
    firebaseUid: "fictional-pilot-user", email: "fictional@example.invalid",
    isPlatformOwner: mocks.platformOwner, primaryRole: mocks.primaryRole, roles: [mocks.primaryRole]
  };
  next();
} }));
vi.mock("../middleware/rateLimits", () => ({
  aiRateLimit: (_req: any, _res: any, next: () => void) => next(),
  todayPriorityRateLimit: (_req: any, _res: any, next: () => void) => next(),
  uploadRateLimit: (_req: any, _res: any, next: () => void) => next(),
  workoutDebriefRateLimit: (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("../middleware/aiConsent", () => ({ requireAiConsent: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../middleware/subscription", () => ({ requireActivePlan: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/aiUsageService", () => ({
  usesIosDailyWorkout: mocks.usesDaily,
  getCoachZoeAccess: vi.fn(), logAiUsage: mocks.logUsage
}));
vi.mock("../services/iosDailyWorkoutService", () => ({
  getIosDailyWorkout: mocks.legacyToday, generateIosDailyWorkout: mocks.legacyGenerate,
  getIosWorkoutForCompletion: mocks.legacyCompletion,
  swapIosDailyWorkoutExercise: vi.fn(), dismissIosDailyWorkout: vi.fn()
}));
vi.mock("../services/workoutCompletionService", () => ({ persistCompletedWorkout: mocks.persistCompletion }));
vi.mock("../services/workoutDebriefService", () => ({
  initializeWorkoutDebrief: mocks.initializeDebrief, getWorkoutDebrief: vi.fn(), generateWorkoutDebrief: vi.fn()
}));
vi.mock("../integrations/openai", async importOriginal => ({
  ...await importOriginal<typeof import("../integrations/openai")>(),
  createCoachWorkoutPlan: mocks.createPlan
}));
vi.mock("../services/beginnerProgrammeService", () => ({
  getBeginnerProgramme: mocks.getProgramme,
  setBeginnerProgrammeStatus: mocks.setStatus,
  getBeginnerProgrammeWorkout: mocks.getWorkout,
  getBeginnerProgrammeWorkoutForCompletion: mocks.getForCompletion,
  generateBeginnerProgrammeWorkout: mocks.generateProgramme,
  dismissBeginnerProgrammeWorkout: mocks.dismissProgramme,
  swapBeginnerProgrammeWorkoutExercise: mocks.swapProgramme,
  withBeginnerProgrammeCompletion: mocks.completeProgramme
}));

const ownerId = "11111111-1111-4111-8111-111111111111";
const summary = {
  id: "22222222-2222-4222-8222-222222222222", status: "active", completedSessions: 0,
  nextSessionNumber: 1, stage: "foundation", stageLabel: "Getting comfortable", nextSessionKind: "A",
  note: "Build a comfortable starting point.", lastSetup: null
};
const savedWorkout = {
  workoutCompletionKey: "33333333-3333-4333-8333-333333333333",
  request: { location: "home", timeAvailable: "20", goal: "general_fitness", equipment: "Bodyweight" },
  workout: {
    title: "A comfortable start", experienceVersion: 2, focus: "Full body strength", intensity: "easy",
    estimatedDurationMinutes: 20, exercises: [{ name: "Bodyweight Squat", sets: 2, reps: "8" }]
  }, completed: false, dismissed: false
};

describe("owner-only beginner programme route boundaries", () => {
  let base = "", close: (() => Promise<void>) | undefined;
  beforeAll(async () => {
    const { aiRouter } = await import("../routes/ai");
    const { logsRouter } = await import("../routes/logs");
    const app = express(); app.use(express.json()); app.use(aiRouter); app.use(logsRouter); app.use(errorHandler);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  afterAll(async () => close?.());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformOwner = false; mocks.primaryRole = "client"; mocks.flag = false; mocks.schema = true; mocks.workoutV2 = true;
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.getProgramme.mockResolvedValue(summary);
    mocks.setStatus.mockResolvedValue(summary);
    mocks.getWorkout.mockResolvedValue(savedWorkout);
    mocks.getForCompletion.mockResolvedValue(null);
    mocks.usesDaily.mockResolvedValue(true);
    mocks.legacyToday.mockResolvedValue(savedWorkout);
    mocks.legacyCompletion.mockResolvedValue(savedWorkout);
    mocks.legacyGenerate.mockResolvedValue(savedWorkout);
    mocks.completeProgramme.mockImplementation((_userId, _key, save) => save());
    mocks.persistCompletion.mockResolvedValue({ burnLog: { id: "saved-event", metadata: {}, created_at: new Date().toISOString() }, summary: {} });
    mocks.initializeDebrief.mockResolvedValue(null);
  });

  const programmeCalls = () => [mocks.getProgramme, mocks.setStatus, mocks.getWorkout,
    mocks.getForCompletion, mocks.generateProgramme, mocks.dismissProgramme, mocks.swapProgramme, mocks.completeProgramme];
  function expectNoProgrammeWork() {
    for (const fn of programmeCalls()) expect(fn).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  }
  function post(body: unknown) {
    return fetch(`${base}/ai/workout/programme`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
  }
  function complete(extra: Record<string, unknown> = {}) {
    return fetch(`${base}/burn-logs/completed-workout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutCompletionKey: savedWorkout.workoutCompletionKey, workoutTitle: "Submitted title",
        workoutType: "Full body strength", workoutDifficulty: "easy", durationMinutes: 20,
        exercises: savedWorkout.workout.exercises, ...extra
      })
    });
  }

  it.each([false, true])("returns unavailable without programme work for a non-owner when flag=%s", async flag => {
    mocks.flag = flag;
    const response = await fetch(`${base}/ai/workout/programme`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, programme: null });
    expectNoProgrammeWork();
  });

  it("does not treat a gym owner role as the platform owner", async () => {
    mocks.primaryRole = "owner"; mocks.flag = true;
    const response = await post({ action: "start" });
    expect(response.status).toBe(403);
    expectNoProgrammeWork();
  });

  it("does not permit the platform owner to enrol while the pilot switch is off", async () => {
    mocks.platformOwner = true;
    expect((await post({ action: "start" })).status).toBe(403);
    expectNoProgrammeWork();
  });

  it("cannot activate the owner pilot before its schema switch is enabled", async () => {
    mocks.platformOwner = true; mocks.flag = true; mocks.schema = false;
    expect((await post({ action: "start" })).status).toBe(403);
    expectNoProgrammeWork();
  });

  it.each(["start", "pause", "resume", "leave"])("rejects non-owner action %s without state changes or AI usage", async action => {
    mocks.flag = true;
    expect((await post({ action })).status).toBe(403);
    expectNoProgrammeWork();
  });

  it("reads the eligible owner's current programme without generating another workout", async () => {
    mocks.platformOwner = true; mocks.flag = true;
    const response = await fetch(`${base}/ai/workout/programme`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, programme: summary });
    expect(mocks.getProgramme).toHaveBeenCalledWith(ownerId);
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it.each(["start", "pause", "resume", "leave"])("allows owner action %s without pre-generating sessions", async action => {
    mocks.platformOwner = true; mocks.flag = true;
    const response = await post({ action });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true, programme: summary });
    expect(mocks.setStatus).toHaveBeenCalledWith(ownerId, action);
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions without changing state", async () => {
    mocks.platformOwner = true; mocks.flag = true;
    expect((await post({ action: "advance" })).status).toBe(400);
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
  });

  it("rejects an extra account identifier rather than acting for another user", async () => {
    mocks.platformOwner = true; mocks.flag = true;
    expect((await post({ action: "start", userId: "another-user" })).status).toBe(400);
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
  });

  it.each(["start", "resume"])("preserves assigned trainer work before %s", async action => {
    mocks.platformOwner = true; mocks.flag = true;
    mocks.query.mockImplementation(async (sql: string) => {
      // Migration 018 stores the client in client_id and permits assigned/completed/missed only.
      if (!/trainer_homework_assignments\s+where client_id=\$1 and status='assigned'/.test(sql)) {
        throw new Error("Unexpected trainer-assignment schema in pilot access check");
      }
      return { rows: [{ exists: 1 }], rowCount: 1 };
    });
    const response = await post({ action });
    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringMatching(/where client_id=\$1 and status='assigned'/), [ownerId]);
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("retains the owner's existing session and local-day offset when new enrolment is switched off", async () => {
    mocks.platformOwner = true;
    const response = await fetch(`${base}/ai/workout/today?timezoneOffsetMinutes=-480`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dailyWorkout: savedWorkout });
    expect(mocks.getWorkout).toHaveBeenCalledWith(ownerId, expect.any(Date), -480);
    expect(mocks.legacyToday).not.toHaveBeenCalled();
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("does not read programme storage for the owner while the schema switch is off", async () => {
    mocks.platformOwner = true; mocks.schema = false;
    const response = await fetch(`${base}/ai/workout/today`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dailyWorkout: savedWorkout });
    expect(mocks.legacyToday).toHaveBeenCalledWith(ownerId);
    expectNoProgrammeWork();
  });

  it("reopens an existing owner session with the generation request's local-day offset without AI work", async () => {
    mocks.platformOwner = true; mocks.flag = true;
    const response = await fetch(`${base}/ai/workout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedWorkout.request, programmeMode: "routine", timezoneOffsetMinutes: -480 })
    });
    expect(response.status).toBe(200);
    expect(mocks.getWorkout).toHaveBeenCalledWith(ownerId, expect.any(Date), -480);
    expect(mocks.legacyGenerate).not.toHaveBeenCalled();
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it.each([false, true])("protects a paid-web owner's unfinished session while the routine is paused and pilot=%s", async flag => {
    mocks.platformOwner = true; mocks.flag = flag;
    mocks.usesDaily.mockResolvedValue(false);
    mocks.getProgramme.mockResolvedValue({ ...summary, status: "paused" });
    const response = await fetch(`${base}/ai/workout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedWorkout.request, programmeMode: "routine", timezoneOffsetMinutes: -480 })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workout: savedWorkout.workout, dailyWorkout: savedWorkout });
    expect(mocks.getWorkout).toHaveBeenCalledWith(ownerId, expect.any(Date), -480);
    expect(mocks.getProgramme).not.toHaveBeenCalled();
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.legacyGenerate).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it.each([true, false])("requires finishing or dismissing the current owner session before one-off generation when dailyLimited=%s", async dailyLimited => {
    mocks.platformOwner = true; mocks.usesDaily.mockResolvedValue(dailyLimited);
    const response = await fetch(`${base}/ai/workout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedWorkout.request, programmeMode: "one_off", timezoneOffsetMinutes: -480 })
    });
    expect(response.status).toBe(409);
    expect(mocks.getProgramme).not.toHaveBeenCalled();
    expect(mocks.generateProgramme).not.toHaveBeenCalled();
    expect(mocks.legacyGenerate).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves today's normal workout for non-owners when flag=%s", async flag => {
    mocks.flag = flag;
    const response = await fetch(`${base}/ai/workout/today`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dailyWorkout: savedWorkout });
    expect(mocks.usesDaily).toHaveBeenCalledWith(ownerId);
    expect(mocks.legacyToday).toHaveBeenCalledWith(ownerId);
    expectNoProgrammeWork();
  });

  it("does not let a member opt into the pilot by forging a routine generation request", async () => {
    mocks.flag = true;
    const response = await fetch(`${base}/ai/workout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...savedWorkout.request, programmeMode: "routine", timezoneOffsetMinutes: -480 })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dailyWorkout: savedWorkout });
    expect(mocks.legacyGenerate).toHaveBeenCalledOnce();
    expectNoProgrammeWork();
  });

  it("does not expose the pilot in a gym owner's existing workout access response", async () => {
    mocks.flag = true; mocks.primaryRole = "owner";
    const response = await fetch(`${base}/ai/workout/visual-access`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ beginnerProgrammePilotEnabled: false });
    expectNoProgrammeWork();
  });

  it("exposes the pilot availability only to the enabled platform owner", async () => {
    mocks.flag = true; mocks.platformOwner = true;
    const response = await fetch(`${base}/ai/workout/visual-access`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ beginnerProgrammePilotEnabled: true });
    expectNoProgrammeWork();
  });

  it.each(["client", "owner"])("keeps legacy completion for a non-platform %s even with the pilot enabled", async role => {
    mocks.primaryRole = role; mocks.flag = true;
    const response = await complete();
    expect(response.status).toBe(201);
    expect(mocks.legacyCompletion).toHaveBeenCalledWith(ownerId, savedWorkout.workoutCompletionKey);
    expect(mocks.persistCompletion).toHaveBeenCalledWith(expect.not.objectContaining({ deferredSideEffects: expect.any(Array) }));
    expectNoProgrammeWork();
  });

  it("preserves legacy owner completion when programme schema support is disabled", async () => {
    mocks.platformOwner = true; mocks.schema = false; mocks.flag = true;
    expect((await complete()).status).toBe(201);
    expect(mocks.legacyCompletion).toHaveBeenCalledWith(ownerId, savedWorkout.workoutCompletionKey);
    expectNoProgrammeWork();
  });

  it("allows a stored owner programme completion after disabling new pilot enrolment", async () => {
    mocks.platformOwner = true; mocks.usesDaily.mockResolvedValue(false);
    mocks.getForCompletion.mockResolvedValue(savedWorkout);
    const response = await complete();
    expect(response.status).toBe(201);
    expect(mocks.getForCompletion).toHaveBeenCalledWith(ownerId, savedWorkout.workoutCompletionKey);
    expect(mocks.completeProgramme).toHaveBeenCalledWith(ownerId, savedWorkout.workoutCompletionKey, expect.any(Function), savedWorkout.workout);
    expect(mocks.persistCompletion).toHaveBeenCalledWith(expect.objectContaining({
      workoutTitle: savedWorkout.workout.title, exercises: savedWorkout.workout.exercises,
      deferredSideEffects: expect.any(Array)
    }));
    expect(mocks.legacyCompletion).not.toHaveBeenCalled();
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("retains partial completion for a stored owner programme if both workout rollout switches are off", async () => {
    mocks.platformOwner = true; mocks.workoutV2 = false;
    mocks.usesDaily.mockResolvedValue(false);
    mocks.getForCompletion.mockResolvedValue(savedWorkout);
    expect((await complete({ completedExerciseIndexes: [0], actualDurationMinutes: 8 })).status).toBe(201);
    expect(mocks.completeProgramme).toHaveBeenCalledWith(ownerId, savedWorkout.workoutCompletionKey, expect.any(Function), savedWorkout.workout);
    expect(mocks.persistCompletion).toHaveBeenCalledWith(expect.objectContaining({
      durationMinutes: 8, extraMetadata: expect.objectContaining({ completedExerciseIndexes: [0] })
    }));
    expect(mocks.createPlan).not.toHaveBeenCalled();
  });

  it("does not extend programme rollback permissions to ordinary accounts when workout V2 is off", async () => {
    mocks.workoutV2 = false; mocks.flag = true;
    expect((await complete({ completedExerciseIndexes: [0] })).status).toBe(403);
    expect(mocks.persistCompletion).not.toHaveBeenCalled();
    expectNoProgrammeWork();
  });
});
