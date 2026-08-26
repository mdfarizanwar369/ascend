export type FoodPortionUnit = "g" | "ml" | "piece" | "slice" | "serving";
export type FoodPortionLabel = "small" | "regular" | "large" | "unknown";
export type FoodNutritionSource = "ascend_database" | "ai_estimate" | "standard_serving_fallback";
export type FoodPortionSource = "ai_vision" | "standard_serving_fallback";

export interface FoodNutritionValues {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodNutritionBasis {
  amount: number;
  unit: FoodPortionUnit;
  nutrition: FoodNutritionValues;
  source: FoodNutritionSource;
  sourceDetail?: string | null;
}

export interface FoodPortionItem {
  id: string;
  name: string;
  normalizedName: string;
  preparation?: string | null;
  estimatedQuantity: number | null;
  finalQuantity: number | null;
  unit: FoodPortionUnit;
  foodConfidence: number;
  portionConfidence: number;
  visiblePortionLabel: FoodPortionLabel;
  notes?: string | null;
  nutritionSource: FoodNutritionSource;
  portionSource: FoodPortionSource;
  nutritionBasis: FoodNutritionBasis;
  nutrition: FoodNutritionValues;
  userAdjusted: boolean;
  fallbackReason?: string | null;
}

export const PORTION_QUANTITY_MAXIMUMS: Record<FoodPortionUnit, number> = {
  g: 3000,
  ml: 5000,
  piece: 30,
  slice: 30,
  serving: 10
};

const ZERO_NUTRITION: FoodNutritionValues = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function roundPortionQuantity(value: number, unit: FoodPortionUnit) {
  const safe = finiteNonNegative(value);
  if (unit === "g" || unit === "ml") {
    if (safe < 20) return Math.round(safe);
    return Math.round(safe / 5) * 5;
  }
  return Math.round(safe * 2) / 2;
}

export function scaleNutrition(nutrition: FoodNutritionValues, multiplier: number): FoodNutritionValues {
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  return {
    calories: Math.round(finiteNonNegative(nutrition.calories) * safeMultiplier),
    proteinG: Math.round(finiteNonNegative(nutrition.proteinG) * safeMultiplier * 10) / 10,
    carbsG: Math.round(finiteNonNegative(nutrition.carbsG) * safeMultiplier * 10) / 10,
    fatG: Math.round(finiteNonNegative(nutrition.fatG) * safeMultiplier * 10) / 10
  };
}

export function recalculatePortionItem(item: FoodPortionItem, requestedQuantity: number): FoodPortionItem {
  const finalQuantity = roundPortionQuantity(requestedQuantity, item.unit);
  const basis = item.nutritionBasis;
  if (!basis || basis.amount <= 0 || basis.unit !== item.unit) {
    return { ...item, finalQuantity, userAdjusted: finalQuantity !== item.estimatedQuantity };
  }

  return {
    ...item,
    finalQuantity,
    nutrition: scaleNutrition(basis.nutrition, finalQuantity / basis.amount),
    userAdjusted: item.estimatedQuantity === null ? item.userAdjusted : finalQuantity !== item.estimatedQuantity
  };
}

export function aggregatePortionNutrition(items: FoodPortionItem[]): FoodNutritionValues {
  return items.reduce<FoodNutritionValues>((total, item) => ({
    calories: total.calories + finiteNonNegative(item.nutrition.calories),
    proteinG: total.proteinG + finiteNonNegative(item.nutrition.proteinG),
    carbsG: total.carbsG + finiteNonNegative(item.nutrition.carbsG),
    fatG: total.fatG + finiteNonNegative(item.nutrition.fatG)
  }), { ...ZERO_NUTRITION });
}

export function portionAdjustmentMagnitude(items: FoodPortionItem[]) {
  const ratios = items.flatMap((item) => {
    if (!item.estimatedQuantity || item.estimatedQuantity <= 0 || item.finalQuantity === null) return [];
    return [Math.abs(item.finalQuantity - item.estimatedQuantity) / item.estimatedQuantity];
  });
  if (!ratios.length) return 0;
  return Math.round((ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length) * 1000) / 1000;
}
