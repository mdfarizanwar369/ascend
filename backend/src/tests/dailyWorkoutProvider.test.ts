import { afterEach, describe, expect, it, vi } from "vitest";

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
});
