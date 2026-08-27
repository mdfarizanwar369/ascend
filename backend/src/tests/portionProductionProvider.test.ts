import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imageDataUrl = "data:image/jpeg;base64,QUJDRA==";

function geminiResponse(text: string) {
  return new Response(JSON.stringify({
    candidates: [{
      finishReason: "STOP",
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

async function loadProvider() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");

  vi.doMock("../services/aiUsageService", () => ({
    assertFoodAiAllowance: vi.fn(async () => undefined),
    getCachedFoodEstimate: vi.fn(async () => null),
    imageHashFromDataUrl: vi.fn(() => "image-hash"),
    logAiUsage: vi.fn(async () => undefined),
    saveFoodEstimateCache: vi.fn(async () => undefined)
  }));
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

  it("uses one Gemini provider call for malformed output and does not retry automatically", async () => {
    const fetchMock = vi.fn(async () => geminiResponse("{ malformed"));
    vi.stubGlobal("fetch", fetchMock);
    const { estimateFoodFromImage } = await loadProvider();

    await expect(estimateFoodFromImage(imageDataUrl, { userId: "user-1", portionAware: true })).rejects.toThrow("Food AI returned a malformed response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
