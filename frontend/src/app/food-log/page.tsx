import { FoodLogClient } from "@/components/food/FoodLogClient";

export default async function FoodLogPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string }> | { view?: string };
}) {
  const params = searchParams ? await searchParams : {};
  return <FoodLogClient initialView={params?.view === "history" ? "history" : "log"} />;
}
