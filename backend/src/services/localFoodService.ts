import { FoodEstimate } from "@ascend/shared";
import { query } from "../db/pool";

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
