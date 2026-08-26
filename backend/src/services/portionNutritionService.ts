import {
  aggregatePortionNutrition,
  FoodEstimate,
  FoodNutritionBasis,
  FoodNutritionValues,
  FoodPortionItem,
  FoodPortionLabel,
  FoodPortionUnit,
  PORTION_QUANTITY_MAXIMUMS,
  recalculatePortionItem,
  roundPortionQuantity
} from "@ascend/shared";
import { z } from "zod";
import { findLocalFoodForPortion, LocalFoodPortionMatch } from "./localFoodService";

const portionUnitSchema = z.enum(["g", "ml", "piece", "slice", "serving"]);
const portionLabelSchema = z.enum(["small", "regular", "large", "unknown"]);
const consumptionEvidenceSchema = z.enum(["visible_food", "opened_or_served_condiment", "sealed_packaging_only"]);
const nutritionValueSchema = z.number().finite().min(0).max(5000);
const savedNutritionSchema = z.object({
  calories: nutritionValueSchema,
  proteinG: nutritionValueSchema,
  carbsG: nutritionValueSchema,
  fatG: nutritionValueSchema
});

export const portionAwareVisionResponseSchema = z.object({
  mealName: z.string().trim().min(1).max(160),
  overallConfidence: z.number().finite().min(0).max(1),
  portionEstimationConfidence: z.number().finite().min(0).max(1),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    normalizedHint: z.string().trim().max(120).default(""),
    estimatedQuantity: z.number().finite().positive().max(5000).nullable(),
    unit: portionUnitSchema,
    quantityConfidence: z.number().finite().min(0).max(1),
    foodConfidence: z.number().finite().min(0).max(1),
    visiblePortionLabel: portionLabelSchema,
    consumptionEvidence: consumptionEvidenceSchema.default("visible_food"),
    preparation: z.string().trim().max(120).nullable(),
    notes: z.string().trim().max(240).nullable(),
    nutritionForVisibleQuantity: savedNutritionSchema
  })).min(1).max(12),
  clarificationRequired: z.boolean().default(false),
  clarification: z.string().trim().max(240).nullable().default(null)
});

export type PortionAwareVisionResponse = z.infer<typeof portionAwareVisionResponseSchema>;

const savedPortionItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  normalizedName: z.string().trim().min(1).max(120),
  preparation: z.string().trim().max(120).nullable().optional(),
  estimatedQuantity: z.number().finite().positive().max(5000).nullable(),
  finalQuantity: z.number().finite().positive().max(5000).nullable(),
  unit: portionUnitSchema,
  foodConfidence: z.number().finite().min(0).max(1),
  portionConfidence: z.number().finite().min(0).max(1),
  visiblePortionLabel: portionLabelSchema,
  notes: z.string().trim().max(240).nullable().optional(),
  nutritionSource: z.enum(["ascend_database", "ai_estimate", "standard_serving_fallback"]),
  portionSource: z.enum(["ai_vision", "standard_serving_fallback"]),
  nutritionBasis: z.object({
    amount: z.number().finite().positive().max(5000),
    unit: portionUnitSchema,
    nutrition: savedNutritionSchema,
    source: z.enum(["ascend_database", "ai_estimate", "standard_serving_fallback"]),
    sourceDetail: z.string().trim().max(200).nullable().optional()
  }),
  nutrition: savedNutritionSchema,
  userAdjusted: z.boolean(),
  fallbackReason: z.string().trim().max(240).nullable().optional()
});

const savedPortionEstimateSchema = z.object({
  foodName: z.string().trim().min(1).max(160),
  confidence: z.number().finite().min(0).max(1),
  calories: nutritionValueSchema,
  proteinG: nutritionValueSchema,
  carbsG: nutritionValueSchema,
  fatG: nutritionValueSchema,
  notes: z.string().trim().max(500),
  analysisVersion: z.literal("portion_aware_v1"),
  recognitionConfidence: z.number().finite().min(0).max(1),
  portionConfidence: z.number().finite().min(0).max(1),
  visiblePortionLabel: portionLabelSchema,
  items: z.array(savedPortionItemSchema).min(1).max(12),
  clarificationRequired: z.boolean().optional(),
  clarification: z.string().trim().max(240).nullable().optional(),
  portionFallback: z.boolean().optional()
});

export type PortionNutritionDependencies = {
  findLocalFood: typeof findLocalFoodForPortion;
};

const portionAnalysisInFlight = new Map<string, Promise<FoodEstimate>>();

const defaultDependencies: PortionNutritionDependencies = {
  findLocalFood: findLocalFoodForPortion
};

function nutritionFromRaw(item: PortionAwareVisionResponse["items"][number]): FoodNutritionValues {
  return item.nutritionForVisibleQuantity;
}

function localNutrition(localFood: LocalFoodPortionMatch): FoodNutritionValues {
  return {
    calories: localFood.typicalCalories,
    proteinG: localFood.typicalProteinG,
    carbsG: localFood.typicalCarbsG,
    fatG: localFood.typicalFatG
  };
}

function safeQuantity(quantity: number | null, unit: FoodPortionUnit) {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || quantity > PORTION_QUANTITY_MAXIMUMS[unit]) return null;
  return roundPortionQuantity(quantity, unit);
}

function itemId(index: number, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "food";
  return `portion-${index + 1}-${slug}`;
}

function aiBasis(item: PortionAwareVisionResponse["items"][number], amount: number, unit: FoodPortionUnit): FoodNutritionBasis {
  return {
    amount,
    unit,
    nutrition: nutritionFromRaw(item),
    source: "ai_estimate",
    sourceDetail: "Visible-portion nutrition returned by the existing vision request"
  };
}

function localScalableBasis(localFood: LocalFoodPortionMatch): FoodNutritionBasis | null {
  if (!localFood.nutritionBasisAmount || !localFood.nutritionBasisUnit || !localFood.nutritionBasisSource) return null;
  return {
    amount: localFood.nutritionBasisAmount,
    unit: localFood.nutritionBasisUnit,
    nutrition: localNutrition(localFood),
    source: "ascend_database",
    sourceDetail: localFood.nutritionBasisSource
  };
}

async function normalizeItem(
  item: PortionAwareVisionResponse["items"][number],
  index: number,
  deps: PortionNutritionDependencies
): Promise<FoodPortionItem> {
  const localFood = await deps.findLocalFood(item.name, item.normalizedHint);
  const sanitizedQuantity = safeQuantity(item.estimatedQuantity, item.unit);
  const scalableLocalBasis = localFood ? localScalableBasis(localFood) : null;

  if (sanitizedQuantity !== null) {
    const usableLocalBasis = scalableLocalBasis?.unit === item.unit ? scalableLocalBasis : null;
    const basis = usableLocalBasis ?? aiBasis(item, sanitizedQuantity, item.unit);
    const baseItem: FoodPortionItem = {
      id: itemId(index, localFood?.name ?? item.name),
      name: localFood?.name ?? item.name,
      normalizedName: item.normalizedHint || localFood?.name || item.name,
      preparation: item.preparation,
      estimatedQuantity: sanitizedQuantity,
      finalQuantity: sanitizedQuantity,
      unit: item.unit,
      foodConfidence: item.foodConfidence,
      portionConfidence: item.quantityConfidence,
      visiblePortionLabel: item.visiblePortionLabel,
      notes: item.notes,
      nutritionSource: basis.source,
      portionSource: "ai_vision",
      nutritionBasis: basis,
      nutrition: basis.nutrition,
      userAdjusted: false,
      fallbackReason: usableLocalBasis ? null : localFood ? "Local match has no compatible verified scalable basis." : null
    };
    return recalculatePortionItem(baseItem, sanitizedQuantity);
  }

  const fallbackNutrition = localFood ? localNutrition(localFood) : nutritionFromRaw(item);
  const basis: FoodNutritionBasis = {
    amount: 1,
    unit: "serving",
    nutrition: fallbackNutrition,
    source: localFood ? "standard_serving_fallback" : "ai_estimate",
    sourceDetail: localFood ? "Ascend local standard serving" : "AI standard-serving fallback"
  };
  return {
    id: itemId(index, localFood?.name ?? item.name),
    name: localFood?.name ?? item.name,
    normalizedName: item.normalizedHint || localFood?.name || item.name,
    preparation: item.preparation,
    estimatedQuantity: null,
    finalQuantity: 1,
    unit: "serving",
    foodConfidence: item.foodConfidence,
    portionConfidence: Math.min(item.quantityConfidence, 0.25),
    visiblePortionLabel: "unknown",
    notes: item.notes,
    nutritionSource: basis.source,
    portionSource: "standard_serving_fallback",
    nutritionBasis: basis,
    nutrition: fallbackNutrition,
    userAdjusted: false,
    fallbackReason: item.estimatedQuantity === null
      ? "The visible quantity could not be estimated reliably."
      : "The estimated quantity was outside safe V1 limits."
  };
}

function mealPortionLabel(items: FoodPortionItem[]): FoodPortionLabel {
  const labels = items.map((item) => item.visiblePortionLabel).filter((label) => label !== "unknown");
  if (!labels.length) return "unknown";
  if (labels.filter((label) => label === "large").length >= Math.ceil(labels.length / 2)) return "large";
  if (labels.filter((label) => label === "small").length >= Math.ceil(labels.length / 2)) return "small";
  return "regular";
}

export function parsePortionAwareVisionResponse(value: unknown) {
  return portionAwareVisionResponseSchema.parse(value);
}

export function portionAwareNutritionRollout(input: {
  globallyEnabled: boolean;
  ownerPilotEnabled: boolean;
  isPlatformOwner: boolean;
}) {
  return input.globallyEnabled || (input.ownerPilotEnabled && input.isPlatformOwner);
}

export function runPortionAnalysisSingleFlight(key: string, task: () => Promise<FoodEstimate>) {
  const existing = portionAnalysisInFlight.get(key);
  if (existing) return existing;
  const pending = task().finally(() => {
    if (portionAnalysisInFlight.get(key) === pending) portionAnalysisInFlight.delete(key);
  });
  portionAnalysisInFlight.set(key, pending);
  return pending;
}

export async function buildPortionAwareEstimate(
  raw: PortionAwareVisionResponse,
  deps: PortionNutritionDependencies = defaultDependencies
): Promise<FoodEstimate> {
  const edibleItems = raw.items.filter((item) => item.consumptionEvidence !== "sealed_packaging_only");
  if (!edibleItems.length) throw new Error("Portion-aware response did not identify visible edible food.");
  const items = await Promise.all(edibleItems.map((item, index) => normalizeItem(item, index, deps)));
  const totals = aggregatePortionNutrition(items);
  if (totals.calories <= 0) throw new Error("Portion-aware response did not contain usable nutrition.");
  const portionFallback = items.some((item) => item.portionSource === "standard_serving_fallback");

  return {
    foodName: edibleItems.length === raw.items.length ? raw.mealName : items.map((item) => item.name).join(" and "),
    confidence: raw.overallConfidence,
    recognitionConfidence: raw.overallConfidence,
    portionConfidence: raw.portionEstimationConfidence,
    visiblePortionLabel: mealPortionLabel(items),
    calories: Math.round(totals.calories),
    proteinG: Math.round(totals.proteinG * 10) / 10,
    carbsG: Math.round(totals.carbsG * 10) / 10,
    fatG: Math.round(totals.fatG * 10) / 10,
    notes: portionFallback
      ? "Estimated from this photo. One or more items use a standard-serving fallback because the visible amount was unclear."
      : "Estimated from the visible portions in this photo.",
    analysisVersion: "portion_aware_v1",
    items,
    clarificationRequired: raw.clarificationRequired,
    clarification: raw.clarification,
    portionFallback
  };
}

export function isPortionAwareEstimate(estimate: FoodEstimate): estimate is FoodEstimate & { items: FoodPortionItem[] } {
  return estimate.analysisVersion === "portion_aware_v1" && Array.isArray(estimate.items) && estimate.items.length > 0;
}

export function recalculatePortionAwareEstimate(estimate: FoodEstimate): FoodEstimate {
  if (!isPortionAwareEstimate(estimate)) return estimate;
  const items = estimate.items.map((item) => recalculatePortionItem(item, item.finalQuantity ?? item.nutritionBasis.amount));
  const totals = aggregatePortionNutrition(items);
  return {
    ...estimate,
    items,
    calories: Math.round(totals.calories),
    proteinG: Math.round(totals.proteinG * 10) / 10,
    carbsG: Math.round(totals.carbsG * 10) / 10,
    fatG: Math.round(totals.fatG * 10) / 10
  };
}

export function parsePortionAwareEstimateForSave(value: unknown) {
  const parsed = savedPortionEstimateSchema.parse(value) as FoodEstimate;
  for (const item of parsed.items ?? []) {
    if (item.finalQuantity !== null && item.finalQuantity > PORTION_QUANTITY_MAXIMUMS[item.unit]) {
      throw new z.ZodError([{
        code: "custom",
        path: ["items", item.id, "finalQuantity"],
        message: `Quantity is implausible for unit ${item.unit}.`
      }]);
    }
  }
  return recalculatePortionAwareEstimate(parsed);
}
