import { FoodEstimate, FoodPortionUnit } from "@ascend/shared";
import { query } from "../db/pool";

export type LocalFoodPortionMatch = {
  name: string;
  typicalCalories: number;
  typicalProteinG: number;
  typicalCarbsG: number;
  typicalFatG: number;
  nutritionBasisAmount: number | null;
  nutritionBasisUnit: FoodPortionUnit | null;
  nutritionBasisSource: string | null;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function normalizeWithLocalFoodDatabase(estimate: FoodEstimate): Promise<FoodEstimate> {
  if (estimate.confidence < 0.8 || !estimate.foodName.trim()) return estimate;

  const result = await query<{
    name: string;
    typical_calories: number;
    typical_protein_g: string | number;
    typical_carbs_g: string | number;
    typical_fat_g: string | number;
  }>(
    `
    select name, typical_calories, typical_protein_g, typical_carbs_g, typical_fat_g
    from local_food_items
    where lower(name) = lower($1)
      or exists (select 1 from unnest(aliases) alias where lower(alias) = lower($1))
    limit 1
    `,
    [estimate.foodName.trim()]
  );

  const localFood = result.rows[0];
  if (!localFood) return estimate;

  const aiName = normalize(estimate.foodName);
  const localName = normalize(localFood.name);
  if (!aiName.includes(localName) && !localName.includes(aiName)) return estimate;

  return {
    ...estimate,
    foodName: localFood.name,
    calories: Math.round(Number(localFood.typical_calories)),
    proteinG: Number(localFood.typical_protein_g),
    carbsG: Number(localFood.typical_carbs_g),
    fatG: Number(localFood.typical_fat_g),
    notes: `${estimate.notes} Matched against Ascend's local food database for a standard portion.`
  };
}

const portionUnits = new Set<FoodPortionUnit>(["g", "ml", "piece", "slice", "serving"]);

export async function findLocalFoodForPortion(name: string, normalizedHint?: string | null): Promise<LocalFoodPortionMatch | null> {
  const candidates = Array.from(new Set([name, normalizedHint ?? ""].map((value) => value.trim()).filter(Boolean)));
  if (!candidates.length) return null;

  const result = await query<{
    name: string;
    typical_calories: number | string;
    typical_protein_g: number | string;
    typical_carbs_g: number | string;
    typical_fat_g: number | string;
    nutrition_basis_amount: number | string | null;
    nutrition_basis_unit: string | null;
    nutrition_basis_source: string | null;
  }>(
    `
    select name, typical_calories, typical_protein_g, typical_carbs_g, typical_fat_g,
      nutrition_basis_amount, nutrition_basis_unit, nutrition_basis_source
    from local_food_items
    where lower(name) = any($1::text[])
      or exists (
        select 1
        from unnest(aliases) alias
        where lower(alias) = any($1::text[])
      )
    order by case when lower(name) = lower($2) then 0 else 1 end
    limit 1
    `,
    [candidates.map((value) => value.toLowerCase()), name]
  );

  const row = result.rows[0];
  if (!row) return null;
  const basisUnit = portionUnits.has(row.nutrition_basis_unit as FoodPortionUnit)
    ? row.nutrition_basis_unit as FoodPortionUnit
    : null;
  const basisAmount = row.nutrition_basis_amount === null ? null : Number(row.nutrition_basis_amount);

  return {
    name: row.name,
    typicalCalories: Number(row.typical_calories),
    typicalProteinG: Number(row.typical_protein_g),
    typicalCarbsG: Number(row.typical_carbs_g),
    typicalFatG: Number(row.typical_fat_g),
    nutritionBasisAmount: basisAmount && basisAmount > 0 ? basisAmount : null,
    nutritionBasisUnit: basisUnit,
    nutritionBasisSource: row.nutrition_basis_source?.trim() || null
  };
}
