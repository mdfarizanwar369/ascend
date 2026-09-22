import { afterEach, describe, expect, it, vi } from "vitest";

const completeEstimate = {
  foodName: "Banana and two boiled eggs",
  confidence: 0.9,
  calories: 260,
  proteinG: 14,
  carbsG: 28,
  fatG: 11,
  notes: "One medium banana and two large eggs."
};

function geminiResponse(text: string, finishReason = "STOP") {
  return new Response(JSON.stringify({
    candidates: [{ finishReason, content: { parts: [{ text }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function loadProvider(model = "gemini-3.6-flash") {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL", model);
  vi.doMock("../services/aiUsageService", () => ({
    assertFoodAiAllowance: vi.fn(async () => undefined),
    getCachedFoodEstimate: vi.fn(async () => null),
    imageHashFromDataUrl: vi.fn(() => "unused"),
    logAiUsage: vi.fn(async () => undefined),
    saveFoodEstimateCache: vi.fn(async () => undefined)
  }));
  vi.doMock("../services/aiConsentService", () => ({
    assertAiProviderConsent: vi.fn(async () => undefined)
  }));
  vi.doMock("../services/localFoodService", () => ({
    normalizeWithLocalFoodDatabase: vi.fn(async estimate => estimate),
    findLocalFoodForPortion: vi.fn(async () => null)
  }));
  return import("../integrations/openai");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("typed food Gemini estimates", () => {
  it("leaves enough output budget after reasoning for complete nutrition JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const { generationConfig } = JSON.parse(String(init?.body));
      // Reproduce the production failure: default thinking exhausted the old
      // 700-token budget before the nutrition object could finish.
      if (generationConfig.maxOutputTokens < 2048 || generationConfig.thinkingConfig?.thinkingLevel !== "low") {
        return geminiResponse('{"foodName": "Banana", "calories":', "MAX_TOKENS");
      }
      return geminiResponse(JSON.stringify(completeEstimate));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider();

    await expect(estimateFoodFromText("One medium banana and two boiled eggs", { userId: "demo-user" }))
      .resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { logAiUsage } = await import("../services/aiUsageService");
    expect(logAiUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "success" }));
  });

  it.each([
    ["truncated", JSON.stringify({ ...completeEstimate, calories: 0 }), "MAX_TOKENS"],
    ["malformed", "{ malformed", "STOP"]
  ])("uses a different model with the same JSON schema after %s output", async (_case, output, finishReason) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiResponse(output, finishReason))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider();

    await expect(estimateFoodFromText("One medium banana and two boiled eggs"))
      .resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-3.6-flash:generateContent");
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:generateContent");
    const configs = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).generationConfig);
    expect(configs[1]).toMatchObject({
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: configs[0].responseSchema
    });
  });

  it.each([
    ["gemini-3.6-flash", 2],
    ["gemini-2.5-flash", 1]
  ])("rejects incomplete estimates without consuming a successful scan on %s", async (model, attempts) => {
    const fetchMock = vi.fn(async () => geminiResponse(JSON.stringify(completeEstimate), "MAX_TOKENS"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider(model as string);

    await expect(estimateFoodFromText("One medium banana and two boiled eggs", { userId: "demo-user" }))
      .rejects.toThrow("Food AI returned an incomplete response.");
    expect(fetchMock).toHaveBeenCalledTimes(attempts as number);
    const { logAiUsage } = await import("../services/aiUsageService");
    expect(logAiUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "error" }));
    const { normalizeWithLocalFoodDatabase } = await import("../services/localFoodService");
    expect(normalizeWithLocalFoodDatabase).not.toHaveBeenCalled();
  });

  it("checks consent again before sending data to the fallback model", async () => {
    const fetchMock = vi.fn(async () => geminiResponse("{ malformed"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider();
    const { assertAiProviderConsent } = await import("../services/aiConsentService");
    vi.mocked(assertAiProviderConsent)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("AI data sharing is off."));

    await expect(estimateFoodFromText("One medium banana and two boiled eggs")).rejects.toThrow();
    expect(assertAiProviderConsent).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
