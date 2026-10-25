import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const complete = {
  title: "Home mobility", intro: "An easy session for today.", estimatedDurationMinutes: 20,
  focus: "Mobility", intensity: "easy", warmup: ["Walk gently"],
  exercises: [{ name: "Gentle walk", sets: null, reps: null, duration: "10 minutes", rest: null, note: null }], cooldown: ["Breathe slowly"],
  coachTip: "Move comfortably.", disclaimer: "Adjust the workout to your experience level and stop if you experience pain."
};
const request = { location: "home", timeAvailable: "20", goal: "mobility", equipment: "Bodyweight", context: "Fictional test user." } as const;
async function loadProvider(key = "test-key") {
  vi.resetModules();
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", key);
  vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
  vi.doMock("../services/aiConsentService", () => ({ assertAiProviderConsent: vi.fn(async () => undefined) }));
  return import("../integrations/openai");
}
function response(text: string, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("daily workout AI success requirement", () => {
  it("requests complete JSON with enough generation budget", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify(complete)));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).resolves.toMatchObject(complete);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig).toMatchObject({
      maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        required: expect.arrayContaining(["title", "intro", "estimatedDurationMinutes", "focus", "intensity", "warmup", "exercises", "cooldown", "coachTip"]),
        properties: {
          intensity: { type: "STRING", enum: ["easy", "moderate", "challenging"] },
          warmup: { type: "ARRAY", minItems: 1, maxItems: 4, items: { type: "STRING" } },
          cooldown: { type: "ARRAY", minItems: 1, maxItems: 4, items: { type: "STRING" } },
          exercises: {
            minItems: 1, maxItems: 8,
            items: {
              required: expect.arrayContaining(["name", "sets", "reps", "duration", "rest", "note"]),
              properties: { name: { type: "STRING" }, sets: { type: "INTEGER", nullable: true },
                reps: { type: "STRING", nullable: true }, duration: { type: "STRING", nullable: true } }
            }
          }
        }
      }
    });
  });
  it("uses the same Gemini JSON budget for web workouts instead of silently returning a fallback", async () => {
    const generated = { ...complete, title: "Gemini gym session", exercises: [{ name: "Goblet Squat", sets: 3, reps: "10" }] };
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify(generated)));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request)).resolves.toMatchObject(generated);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig).toMatchObject({
      maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json",
      responseSchema: { type: "OBJECT" }
    });
  });
  it("uses one Gemini call and enforces the locally selected exercises for V2", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify(complete)));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    const { buildWorkoutBlueprint } = await import("../services/workoutPlanQualityService");
    const blueprint = buildWorkoutBlueprint({ goal: "strength", location: "home", equipment: "Bodyweight", timeAvailable: "20", recentWorkouts: [], today: "2026-10-03" });
    const result = await createCoachWorkoutPlan(request, { blueprint, requireAiSuccess: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.exercises).toEqual(blueprint.exercises);
    expect(result.experienceVersion).toBe(2);
    expect(result.whyToday).toBe(blueprint.whyToday);
  });
  it("offers exact reviewed names to eligible workout clients without forcing an unsuitable exercise", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify(complete)));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await createCoachWorkoutPlan(request, { preferReviewedVisualNames: true });
    const pilotRequest = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(pilotRequest).toContain("Bird-Dog");
    expect(pilotRequest).toContain("Dumbbell Reverse Lunge");
    expect(pilotRequest).toContain("Do not choose an unsuitable exercise merely to get a visual");
    expect(pilotRequest).toContain("put alternatives or modifications in its note");
    fetchMock.mockClear();
    await createCoachWorkoutPlan(request);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("these reviewed visual exercises");
  });
  it.each([
    [JSON.stringify(complete), "MAX_TOKENS"], ["{ broken", "STOP"],
    [JSON.stringify({ ...complete, exercises: [] }), "STOP"], ["null", "STOP"]
  ])("rejects incomplete provider output without a fake successful workout", async (text, finish) => {
    const fetchMock = vi.fn(async () => response(text, finish));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["object reps", { exercises: [{ name: "Squat", reps: { count: 10 } }] }],
    ["numeric duration", { exercises: [{ name: "Walk", duration: 10 }] }],
    ["empty cleaned prescription", { exercises: [{ name: "Walk", reps: " ** ", duration: "  " }] }],
    ["empty cleaned exercise name", { exercises: [{ name: " ** ", duration: "10 minutes" }] }],
    ["empty cleaned title", { title: " ** " }],
    ["invalid warmup item", { warmup: ["Walk gently", null] }],
    ["invalid cooldown item", { cooldown: ["Breathe slowly", {}] }],
    ["empty cleaned warmup", { warmup: [" ** "] }],
    ["empty cleaned cooldown", { cooldown: [" ** "] }],
    ["invalid intensity", { intensity: "extreme" }],
    ["invalid sets", { exercises: [{ name: "Squat", sets: "3", reps: "10" }] }],
    ["invalid rest", { exercises: [{ name: "Squat", reps: "10", rest: {} }] }]
  ])("rejects %s before normalization can insert defaults", async (_label, overrides) => {
    const fetchMock = vi.fn(async () => response(JSON.stringify({ ...complete, ...overrides })));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accepts valid cleaned rep prescriptions with nullable fields", async () => {
    const generated = { ...complete, exercises: [{ name: "**Goblet Squat**", sets: 3, reps: "**10**", duration: null, rest: null, note: null }] };
    const fetchMock = vi.fn(async () => response(JSON.stringify(generated)));
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).resolves.toMatchObject({
      exercises: [{ name: "Goblet Squat", sets: 3, reps: "10", duration: null }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("preserves other clients' offline fallback but does not spend a native daily allowance", async () => {
    const { createCoachWorkoutPlan } = await loadProvider("");
    await expect(createCoachWorkoutPlan(request)).resolves.toHaveProperty("exercises");
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
  });
  it("does not contact the provider without consent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createCoachWorkoutPlan } = await loadProvider();
    const { assertAiProviderConsent } = await import("../services/aiConsentService");
    vi.mocked(assertAiProviderConsent).mockRejectedValue(new Error("Consent required"));
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns the safe retry response through the production error handler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("{ malformed private provider output")));
    const { createCoachWorkoutPlan } = await loadProvider();
    const { errorHandler } = await import("../middleware/errors");
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    try {
      await createCoachWorkoutPlan(request, { requireAiSuccess: true });
      throw new Error("Expected generation failure");
    } catch (error) {
      errorHandler(error as Error, { method: "POST", path: "/api/v1/ai/workout" } as Request, res as unknown as Response, vi.fn());
    }
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Zoe couldn't build your workout. Please try again; your daily workout is still available." });
  });
  it("keeps unexpected server failure details private", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { errorHandler } = await import("../middleware/errors");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(Object.assign(new Error("private failure details"), { status: 503 }),
      { method: "POST", path: "/api/v1/ai/workout" } as Request, res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error", detail: undefined });
  });
  it("records a failed response stage without logging member data or generated content", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("fetch", vi.fn(async () => response("{ private malformed provider output")));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan({ ...request, context: "private member details" }, { requireAiSuccess: true }))
      .rejects.toMatchObject({ name: "WorkoutGenerationError", status: 503 });
    expect(log).toHaveBeenCalledWith("[workout-ai] generation_failed", {
      provider: "gemini", model: "gemini-3.6-flash", stage: "response_parse", category: "response_parse", durationMs: expect.any(Number)
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|test-key/);
  });
  it("distinguishes incomplete responses from provider or parsing failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(JSON.stringify({ title: "Incomplete" }))));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
    expect(log).toHaveBeenCalledWith("[workout-ai] generation_failed", expect.objectContaining({ stage: "response_validation" }));
  });
  it.each([
    ["MAX_TOKENS", "MAX_TOKENS"], ["SAFETY", "SAFETY"], ["private arbitrary provider text", "UNKNOWN"]
  ])("records only an allowlisted finish reason for %s", async (finishReason, expectedReason) => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn(async () => response(JSON.stringify(complete), finishReason));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[workout-ai] generation_failed", expect.objectContaining({
      stage: "provider", category: "incomplete_response", finishReason: expectedReason
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|test-key/);
  });
  it("retains a blocked finish reason when Gemini returns no text", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn(async () => response("", "SAFETY"));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[workout-ai] generation_failed", expect.objectContaining({
      category: "Empty response", finishReason: "SAFETY"
    }));
  });
});
vi.mock("../services/aiWorkLeaseService", async importOriginal => ({
  ...await importOriginal<typeof import("../services/aiWorkLeaseService")>(),
  withAiWorkLease: (_key: string, work: () => Promise<unknown>) => work(),
  createAiProviderGate: () => (_key: string, work: () => Promise<unknown>) => work()
}));
