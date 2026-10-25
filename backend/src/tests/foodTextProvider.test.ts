import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/aiWorkLeaseService", async importOriginal => ({
  ...await importOriginal<typeof import("../services/aiWorkLeaseService")>(),
  withAiWorkLease: (_key: string, work: () => Promise<unknown>) => work(),
  createAiProviderGate: () => (_key: string, work: () => Promise<unknown>) => work()
}));

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

function geminiErrorResponse(status: number, detail = "private provider response body") {
  return new Response(JSON.stringify({ error: { message: detail } }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
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

  it("stops text-model fallback for a confirmed daily quota limit without exposing the provider body", async () => {
    const fetchMock = vi.fn(async () => geminiErrorResponse(429, "quota_exceeded: daily quota exhausted; private provider response body"));
    vi.stubGlobal("fetch", fetchMock);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { estimateFoodFromText } = await loadProvider();

    await expect(estimateFoodFromText("One banana", { userId: "demo-user" }))
      .rejects.toMatchObject({ category: "service" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("[food-ai]", "food_text_analysis_failed", expect.objectContaining({ status: 429 }));
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private provider response body");
  });

  it.each([401, 402, 403])("stops legacy photo fallback after Gemini HTTP %s", async (status) => {
    const fetchMock = vi.fn(async () => geminiErrorResponse(status));
    vi.stubGlobal("fetch", fetchMock);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { userId: "demo-user", portionAware: false }))
      .rejects.toMatchObject({ category: "request_rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("[food-ai]", "food_analysis_failed", expect.objectContaining({ status }));
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private provider response body");
  });

  it("stops legacy photo fallback for a confirmed daily quota limit", async () => {
    const fetchMock = vi.fn(async () => geminiErrorResponse(429, "quota_exceeded: daily quota exhausted; private provider response body"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { portionAware: false }))
      .rejects.toMatchObject({ category: "service" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries the alternate text model after a generic Gemini 429", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiErrorResponse(429, "RESOURCE_EXHAUSTED: You exceeded your current quota; check your plan and billing details. Please retry in 45s."))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider();

    await expect(estimateFoodFromText("One banana")).resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:generateContent");
  });

  it("retries a generic Gemini 429 once when text has only one configured model", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiErrorResponse(429, "RESOURCE_EXHAUSTED: too many requests"))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider("gemini-2.5-flash");

    await expect(estimateFoodFromText("One banana")).resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:generateContent");
  });

  it("tries one alternate photo model after a generic Gemini 429", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiErrorResponse(429, "RESOURCE_EXHAUSTED: too many requests; check billing details"))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { portionAware: false }))
      .resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:generateContent");
  });

  it("bounds repeated generic Gemini 429 photo attempts and keeps the provider body private", async () => {
    const fetchMock = vi.fn(async () => geminiErrorResponse(429));
    vi.stubGlobal("fetch", fetchMock);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { userId: "demo-user", portionAware: false }))
      .rejects.toMatchObject({ category: "service" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith("[food-ai]", "food_analysis_failed", expect.objectContaining({ status: 429 }));
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private provider response body");
  });

  it("does not spend fallback calls after an explicit billing failure", async () => {
    const fetchMock = vi.fn(async () => geminiErrorResponse(400, "billing account disabled; private provider response body"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { portionAware: false }))
      .rejects.toMatchObject({ category: "request_rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps fallback for a transient Gemini 500", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiErrorResponse(500, "temporary outage"))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromText } = await loadProvider();

    await expect(estimateFoodFromText("One banana")).resolves.toMatchObject(completeEstimate);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps flexible-format fallback for a Gemini 400 schema rejection", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiErrorResponse(400, "response schema unsupported"))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(completeEstimate)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage("data:image/jpeg;base64,QUJDRA==", { portionAware: false }))
      .resolves.toMatchObject({ foodName: completeEstimate.foodName, calories: completeEstimate.calories });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const modes = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).generationConfig.responseMimeType);
    expect(modes).toEqual(["application/json", undefined]);
  });
});
