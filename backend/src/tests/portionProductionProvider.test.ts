import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imageDataUrl = "data:image/jpeg;base64,QUJDRA==";

function geminiResponse(text: string, finishReason = "STOP") {
  return new Response(JSON.stringify({
    candidates: [{
      finishReason,
      content: { parts: [{ text }] }
    }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function validPortionJson() {
  return JSON.stringify({
    mealName: "Chicken rice",
    overallConfidence: 0.92,
    portionEstimationConfidence: 0.7,
    items: [{
      name: "Rice",
      normalizedHint: "cooked white rice",
      estimatedQuantity: 185,
      unit: "g",
      quantityConfidence: 0.72,
      foodConfidence: 0.94,
      visiblePortionLabel: "regular",
      consumptionEvidence: "visible_food",
      preparation: "steamed",
      notes: null,
      nutritionForVisibleQuantity: {
        calories: 241,
        proteinG: 5,
        carbsG: 53,
        fatG: 0.5
      }
    }],
    clarificationRequired: false,
    clarification: null
  });
}

async function loadProvider(model = "gemini-2.5-flash") {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL", model);

  vi.doMock("../services/aiUsageService", () => ({
    assertFoodAiAllowance: vi.fn(async () => undefined),
    getCachedFoodEstimate: vi.fn(async () => null),
    imageHashFromDataUrl: vi.fn(() => "image-hash"),
    logAiUsage: vi.fn(async () => undefined),
    saveFoodEstimateCache: vi.fn(async () => undefined)
  }));
  // These tests exercise response parsing; permission enforcement has its own
  // network-boundary tests in aiConsent.test.ts.
  vi.doMock("../services/aiConsentService", () => ({ assertAiProviderConsent: vi.fn(async () => undefined) }));
  vi.doMock("../services/localFoodService", () => ({
    normalizeWithLocalFoodDatabase: vi.fn(async (estimate) => estimate),
    findLocalFoodForPortion: vi.fn(async () => null)
  }));

  return import("../integrations/openai");
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Portion-Aware Nutrition Production V1 provider calls", () => {
  it.each([
    ["gemini-2.5-flash", { thinkingBudget: 0 }],
    ["gemini-3.6-flash", { thinkingLevel: "low" }]
  ])("reserves room for complete meal JSON with compatible thinking settings on %s", async (model, thinkingConfig) => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(4096);
      expect(request.generationConfig.thinkingConfig).toEqual(thinkingConfig);
      return geminiResponse(validPortionJson());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider(model as string);

    const estimate = await estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true });
    expect(estimate.calories).toBe(241);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a token-limited response even if its partial meal is valid JSON", async () => {
    const fetchMock = vi.fn(async () => geminiResponse(validPortionJson(), "MAX_TOKENS"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider("gemini-3.6-flash");

    await expect(estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true }))
      .rejects.toThrow("Food AI returned an incomplete response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { saveFoodEstimateCache } = await import("../services/aiUsageService");
    expect(saveFoodEstimateCache).not.toHaveBeenCalled();
  });

  it("uses one Gemini provider call for a successful normal photo analysis", async () => {
    const fetchMock = vi.fn(async () => geminiResponse(validPortionJson()));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    const estimate = await estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(estimate).toMatchObject({
      foodName: "Chicken rice",
      analysisVersion: "portion_aware_v1",
      calories: 241
    });
    expect(estimate.items?.[0]).toMatchObject({
      estimatedQuantity: 185,
      finalQuantity: 185,
      nutritionSource: "ai_estimate"
    });
  });

  it("recognizes a primary packaged food in one call without counting an incidental sealed sachet", async () => {
    const response = JSON.parse(validPortionJson());
    response.mealName = "Butter Sugar Cream Roll";
    response.items = [{
      ...response.items[0],
      name: "Butter Sugar Cream Roll",
      normalizedHint: "cream roll",
      estimatedQuantity: null,
      unit: "serving",
      quantityConfidence: 0.2,
      consumptionEvidence: "intended_packaged_food",
      nutritionForVisibleQuantity: { calories: 220, proteinG: 4, carbsG: 34, fatG: 8 }
    }, {
      ...response.items[0],
      name: "Ketchup",
      consumptionEvidence: "sealed_packaging_only"
    }];
    const fetchMock = vi.fn(async () => geminiResponse(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    const estimate = await estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(estimate.foodName).toBe("Butter Sugar Cream Roll");
    expect(estimate.items).toHaveLength(1);
    expect(estimate.notes).toMatch(/check the label/i);
  });

  it("returns a distinct no-food error after one call when Gemini finds no intended food", async () => {
    const response = JSON.parse(validPortionJson());
    response.items = [];
    const fetchMock = vi.fn(async () => geminiResponse(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true }))
      .rejects.toMatchObject({ category: "no_food_detected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses one Gemini provider call for malformed output and does not retry automatically", async () => {
    const fetchMock = vi.fn(async () => geminiResponse("{ malformed"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true })).rejects.toThrow("Food AI returned a malformed response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
vi.mock("../services/aiWorkLeaseService", async importOriginal => ({
  ...await importOriginal<typeof import("../services/aiWorkLeaseService")>(),
  withAiWorkLease: (_key: string, work: () => Promise<unknown>) => work(),
  createAiProviderGate: () => (_key: string, work: () => Promise<unknown>) => work()
}));
