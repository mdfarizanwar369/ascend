import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const complete = {
  title: "Home mobility", intro: "An easy session for today.", estimatedDurationMinutes: 20,
  focus: "Mobility", intensity: "easy", warmup: ["Walk gently"],
  exercises: [{ name: "Gentle walk", duration: "10 minutes" }], cooldown: ["Breathe slowly"],
  coachTip: "Move comfortably."
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
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig).toMatchObject({
      maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json"
    });
  });
  it.each([
    [JSON.stringify(complete), "MAX_TOKENS"], ["{ broken", "STOP"],
    [JSON.stringify({ ...complete, exercises: [] }), "STOP"], ["null", "STOP"]
  ])("rejects incomplete provider output without a fake successful workout", async (text, finish) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(text, finish)));
    const { createCoachWorkoutPlan } = await loadProvider();
    await expect(createCoachWorkoutPlan(request, { requireAiSuccess: true })).rejects.toMatchObject({ status: 503 });
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
});
