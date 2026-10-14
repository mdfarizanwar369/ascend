import { FoodLogClient } from "@/components/food/FoodLogClient";

export default async function FoodLogPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string; meal?: string }> | { view?: string; meal?: string };
}) {
  const params = searchParams ? await searchParams : {};
  const meal = params.meal === "breakfast" || params.meal === "dinner" ? params.meal : "lunch";
  return <FoodLogClient initialView={params?.view === "history" ? "history" : "log"} initialMeal={meal} />;
}
