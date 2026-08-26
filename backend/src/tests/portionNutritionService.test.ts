import { describe, expect, it, vi } from "vitest";
import {
  buildPortionAwareEstimate,
  parsePortionAwareEstimateForSave,
  parsePortionAwareVisionResponse,
  portionAwareNutritionRollout,
  runPortionAnalysisSingleFlight,
  type PortionAwareVisionResponse
} from "../services/portionNutritionService";

function rawItem(overrides: Partial<PortionAwareVisionResponse["items"][number]> = {}) {
  return {
    name: "Chicken breast",
    normalizedHint: "chicken breast cooked",
    estimatedQuantity: 100,
    unit: "g" as const,
    quantityConfidence: 0.78,
    foodConfidence: 0.94,
    visiblePortionLabel: "regular" as const,
    consumptionEvidence: "visible_food" as const,
    preparation: "grilled",
    notes: null,
    nutritionForVisibleQuantity: {
      calories: 190,
      proteinG: 31,
      carbsG: 0,
      fatG: 5
    },
    ...overrides
  };
}

function rawResponse(items: PortionAwareVisionResponse["items"], overrides: Partial<PortionAwareVisionResponse> = {}): PortionAwareVisionResponse {
  return {
    mealName: "Chicken meal",
    overallConfidence: 0.9,
    portionEstimationConfidence: 0.72,
    items,
    clarificationRequired: false,
    clarification: null,
    ...overrides
  };
}

const densityMatch = vi.fn(async () => ({
  name: "Chicken breast",
  typicalCalories: 165,
  typicalProteinG: 31,
  typicalCarbsG: 0,
  typicalFatG: 3.6,
  nutritionBasisAmount: 100,
  nutritionBasisUnit: "g" as const,
  nutritionBasisSource: "verified-test-density"
}));

describe("Portion-Aware Nutrition V1", () => {
  it("scales the same database food proportionally for small and large visible portions", async () => {
    const small = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: 100 })]), { findLocalFood: densityMatch });
    const large = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: 250 })]), { findLocalFood: densityMatch });

    expect(small.calories).toBe(165);
    expect(large.calories).toBe(413);
    expect(large.calories).toBeGreaterThan(small.calories * 2);
  });

  it("keeps the AI quantity when a scalable local food match succeeds", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: 180 })]), { findLocalFood: densityMatch });
    expect(estimate.items?.[0]).toMatchObject({
      estimatedQuantity: 180,
      finalQuantity: 180,
      nutritionSource: "ascend_database",
      portionSource: "ai_vision"
    });
    expect(estimate.calories).toBe(297);
  });

  it("does not replace a visible AI quantity with an unscalable local standard serving", async () => {
    const servingOnlyMatch = vi.fn(async () => ({
      name: "Nasi Lemak",
      typicalCalories: 550,
      typicalProteinG: 22,
      typicalCarbsG: 65,
      typicalFatG: 20,
      nutritionBasisAmount: null,
      nutritionBasisUnit: null,
      nutritionBasisSource: null
    }));
    const estimate = await buildPortionAwareEstimate(rawResponse([
      rawItem({
        name: "Nasi Lemak",
        normalizedHint: "nasi lemak",
        estimatedQuantity: 180,
        nutritionForVisibleQuantity: { calories: 390, proteinG: 12, carbsG: 55, fatG: 14 }
      })
    ]), { findLocalFood: servingOnlyMatch });

    expect(estimate.calories).toBe(390);
    expect(estimate.items?.[0]).toMatchObject({
      estimatedQuantity: 180,
      finalQuantity: 180,
      nutritionSource: "ai_estimate",
      portionSource: "ai_vision"
    });
    expect(estimate.items?.[0].fallbackReason).toContain("no compatible verified scalable basis");
  });

  it("independently scales mixed-meal components and makes the meal total equal the item sum", async () => {
    const noLocal = vi.fn(async () => null);
    const estimate = await buildPortionAwareEstimate(rawResponse([
      rawItem({ name: "Rice", normalizedHint: "cooked white rice", estimatedQuantity: 200, nutritionForVisibleQuantity: { calories: 260, proteinG: 5, carbsG: 57, fatG: 0.6 } }),
      rawItem({ name: "Chicken", normalizedHint: "grilled chicken", estimatedQuantity: 150, nutritionForVisibleQuantity: { calories: 248, proteinG: 46, carbsG: 0, fatG: 5.4 } }),
      rawItem({ name: "Vegetables", normalizedHint: "mixed vegetables", estimatedQuantity: 80, nutritionForVisibleQuantity: { calories: 35, proteinG: 2, carbsG: 7, fatG: 0.2 } }),
      rawItem({ name: "Sauce", normalizedHint: "brown sauce", estimatedQuantity: 30, nutritionForVisibleQuantity: { calories: 60, proteinG: 0, carbsG: 8, fatG: 3 } })
    ]), { findLocalFood: noLocal });

    expect(estimate.items).toHaveLength(4);
    expect(estimate.calories).toBe(603);
    expect(estimate.items?.reduce((total, item) => total + item.nutrition.calories, 0)).toBe(estimate.calories);
  });

  it("keeps a small visible fry count and excludes sealed condiment packets", async () => {
    const noLocal = vi.fn(async () => null);
    const estimate = await buildPortionAwareEstimate(rawResponse([
      rawItem({
        name: "French Fries",
        normalizedHint: "fried potato fries",
        estimatedQuantity: 5,
        unit: "piece",
        quantityConfidence: 0.88,
        foodConfidence: 0.98,
        visiblePortionLabel: "small",
        nutritionForVisibleQuantity: { calories: 155, proteinG: 2, carbsG: 21, fatG: 7 }
      }),
      rawItem({
        name: "Ketchup",
        normalizedHint: "ketchup sachet",
        estimatedQuantity: 30,
        unit: "g",
        consumptionEvidence: "sealed_packaging_only",
        nutritionForVisibleQuantity: { calories: 34, proteinG: 0, carbsG: 8, fatG: 0 }
      })
    ], { mealName: "Fast Food Meal" }), { findLocalFood: noLocal });

    expect(estimate.foodName).toBe("French Fries");
    expect(estimate.items).toHaveLength(1);
    expect(estimate.items?.[0]).toMatchObject({ name: "French Fries", estimatedQuantity: 5, unit: "piece" });
    expect(estimate.calories).toBe(155);
  });

  it("rejects packaging-only images rather than counting packaged condiments as food", async () => {
    await expect(buildPortionAwareEstimate(rawResponse([
      rawItem({
        name: "Ketchup",
        normalizedHint: "sealed ketchup sachet",
        consumptionEvidence: "sealed_packaging_only"
      })
    ]), { findLocalFood: vi.fn(async () => null) })).rejects.toThrow("did not identify visible edible food");
  });

  it("recalculates a user-adjusted quantity while preserving the original AI quantity", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: 200 })]), { findLocalFood: densityMatch });
    const adjusted = parsePortionAwareEstimateForSave({
      ...estimate,
      items: estimate.items?.map((item) => ({ ...item, finalQuantity: 150, userAdjusted: true }))
    });

    expect(adjusted.items?.[0].estimatedQuantity).toBe(200);
    expect(adjusted.items?.[0].finalQuantity).toBe(150);
    expect(adjusted.calories).toBe(248);
  });

  it("keeps recognition and portion confidence separate", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([
      rawItem({ foodConfidence: 0.97, quantityConfidence: 0.42 })
    ], { overallConfidence: 0.95, portionEstimationConfidence: 0.44 }), { findLocalFood: vi.fn(async () => null) });

    expect(estimate.recognitionConfidence).toBe(0.95);
    expect(estimate.portionConfidence).toBe(0.44);
    expect(estimate.items?.[0].foodConfidence).toBe(0.97);
    expect(estimate.items?.[0].portionConfidence).toBe(0.42);
  });

  it("binds AI fallback nutrition to the same visible quantity and rescales from that basis", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([
      rawItem({
        estimatedQuantity: 140,
        nutritionForVisibleQuantity: { calories: 230, proteinG: 43, carbsG: 0, fatG: 5 }
      })
    ]), { findLocalFood: vi.fn(async () => null) });

    expect(estimate.items?.[0]).toMatchObject({
      estimatedQuantity: 140,
      finalQuantity: 140,
      nutritionSource: "ai_estimate",
      nutritionBasis: {
        amount: 140,
        unit: "g",
        nutrition: { calories: 230, proteinG: 43, carbsG: 0, fatG: 5 }
      }
    });

    const adjusted = parsePortionAwareEstimateForSave({
      ...estimate,
      items: estimate.items?.map((item) => ({ ...item, finalQuantity: 70, userAdjusted: true }))
    });
    expect(adjusted.calories).toBe(115);
  });

  it("uses an honest standard-serving fallback when quantity is unavailable", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: null, quantityConfidence: 0.1 })]), { findLocalFood: densityMatch });
    expect(estimate.portionFallback).toBe(true);
    expect(estimate.items?.[0]).toMatchObject({
      estimatedQuantity: null,
      finalQuantity: 1,
      unit: "serving",
      nutritionSource: "standard_serving_fallback",
      portionConfidence: 0.1
    });
    const reopened = parsePortionAwareEstimateForSave(estimate);
    expect(reopened.items?.[0].userAdjusted).toBe(false);
  });

  it("rejects malformed negative and extreme provider quantities", () => {
    const base = rawResponse([rawItem()]);
    expect(() => parsePortionAwareVisionResponse({ ...base, items: [{ ...base.items[0], estimatedQuantity: -400 }] })).toThrow();
    expect(() => parsePortionAwareVisionResponse({ ...base, items: [{ ...base.items[0], estimatedQuantity: 200000 }] })).toThrow();
  });

  it("rejects a legacy flat nutrition payload that is not explicitly tied to the visible quantity", () => {
    const base = rawResponse([rawItem()]);
    const item = { ...base.items[0] } as Record<string, unknown>;
    delete item.nutritionForVisibleQuantity;
    Object.assign(item, { calories: 190, proteinG: 31, carbsG: 0, fatG: 5 });

    expect(() => parsePortionAwareVisionResponse({ ...base, items: [item] })).toThrow();
  });

  it("falls back rather than saving a category-level quantity outlier", async () => {
    const estimate = await buildPortionAwareEstimate(rawResponse([rawItem({ estimatedQuantity: 40, unit: "piece" })]), { findLocalFood: vi.fn(async () => null) });
    expect(estimate.portionFallback).toBe(true);
    expect(estimate.items?.[0].fallbackReason).toContain("outside safe V1 limits");
  });

  it("keeps the rollout disabled unless the global or eligible owner flag is active", () => {
    expect(portionAwareNutritionRollout({ globallyEnabled: false, ownerPilotEnabled: false, isPlatformOwner: true })).toBe(false);
    expect(portionAwareNutritionRollout({ globallyEnabled: false, ownerPilotEnabled: true, isPlatformOwner: false })).toBe(false);
    expect(portionAwareNutritionRollout({ globallyEnabled: false, ownerPilotEnabled: true, isPlatformOwner: true })).toBe(true);
    expect(portionAwareNutritionRollout({ globallyEnabled: true, ownerPilotEnabled: false, isPlatformOwner: false })).toBe(true);
  });

  it("coalesces concurrent analysis for the same versioned image key", async () => {
    let resolveTask: ((estimate: Awaited<ReturnType<typeof buildPortionAwareEstimate>>) => void) | undefined;
    const task = vi.fn(() => new Promise<Awaited<ReturnType<typeof buildPortionAwareEstimate>>>((resolve) => { resolveTask = resolve; }));
    const first = runPortionAnalysisSingleFlight("same-image", task);
    const second = runPortionAnalysisSingleFlight("same-image", task);
    const estimate = await buildPortionAwareEstimate(rawResponse([rawItem()]), { findLocalFood: vi.fn(async () => null) });
    resolveTask?.(estimate);

    await expect(first).resolves.toEqual(estimate);
    await expect(second).resolves.toEqual(estimate);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
