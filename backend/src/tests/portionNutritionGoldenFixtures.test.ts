import { describe, expect, it, vi } from "vitest";
import fixtures from "./fixtures/portion-aware-nutrition-golden.json";
import {
  buildPortionAwareEstimate,
  parsePortionAwareEstimateForSave,
  parsePortionAwareVisionResponse,
  type PortionNutritionDependencies
} from "../services/portionNutritionService";

const scalableMatch = {
  name: "Cooked rice",
  typicalCalories: 130,
  typicalProteinG: 2.7,
  typicalCarbsG: 28,
  typicalFatG: 0.3,
  nutritionBasisAmount: 100,
  nutritionBasisUnit: "g" as const,
  nutritionBasisSource: "golden-fixture-per-100g"
};

const servingOnlyMatch = {
  name: "Nasi Lemak",
  typicalCalories: 105,
  typicalProteinG: 1.3,
  typicalCarbsG: 27,
  typicalFatG: 0.4,
  nutritionBasisAmount: null,
  nutritionBasisUnit: null,
  nutritionBasisSource: null
};

function dependenciesFor(source: string): PortionNutritionDependencies {
  if (source === "scalable") return { findLocalFood: vi.fn(async (name) => ({ ...scalableMatch, name })) };
  if (source === "serving_only") return { findLocalFood: vi.fn(async (name) => ({ ...servingOnlyMatch, name })) };
  return { findLocalFood: vi.fn(async () => null) };
}

describe("Portion-Aware Nutrition golden provider fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const raw = parsePortionAwareVisionResponse(fixture.response);
      let estimate = await buildPortionAwareEstimate(raw, dependenciesFor(fixture.localSource));

      const adjustment = fixture.adjustQuantity;
      if (adjustment !== undefined) {
        estimate = parsePortionAwareEstimateForSave({
          ...estimate,
          items: estimate.items?.map((item, index) => index === 0
            ? { ...item, finalQuantity: adjustment, userAdjusted: true }
            : item)
        });
      }

      expect(estimate.calories).toBe(fixture.expected.calories);
      const itemCount = "itemCount" in fixture.expected ? fixture.expected.itemCount : undefined;
      if (itemCount !== undefined) expect(estimate.items).toHaveLength(itemCount);
      if ("quantity" in fixture.expected) expect(estimate.items?.[0].estimatedQuantity).toBe(fixture.expected.quantity);
      if ("finalQuantity" in fixture.expected) expect(estimate.items?.[0].finalQuantity).toBe(fixture.expected.finalQuantity);
      if ("nutritionSource" in fixture.expected) expect(estimate.items?.[0].nutritionSource).toBe(fixture.expected.nutritionSource);
      if ("portionConfidence" in fixture.expected) expect(estimate.portionConfidence).toBe(fixture.expected.portionConfidence);
      if ("portionFallback" in fixture.expected) expect(estimate.portionFallback).toBe(fixture.expected.portionFallback);
    });
  }

  it("keeps the clearly larger rice fixture directionally larger", async () => {
    const smallFixture = fixtures.find((fixture) => fixture.id === "rice-100g");
    const largeFixture = fixtures.find((fixture) => fixture.id === "rice-250g");
    if (!smallFixture || !largeFixture) throw new Error("Rice comparison fixtures are missing.");

    const small = await buildPortionAwareEstimate(parsePortionAwareVisionResponse(smallFixture.response), dependenciesFor("scalable"));
    const large = await buildPortionAwareEstimate(parsePortionAwareVisionResponse(largeFixture.response), dependenciesFor("scalable"));

    expect(large.items?.[0].estimatedQuantity).toBeGreaterThan(small.items?.[0].estimatedQuantity ?? 0);
    expect(large.calories).toBeGreaterThan(small.calories * 2);
  });
});
