import { FoodLogClient } from "@/components/food/FoodLogClient";
import { PlanGate } from "@/components/PlanGate";

export default function FoodLogPage() {
  return (
    <PlanGate requiredPlan="premium" feature="AI food photo logging">
      <FoodLogClient />
    </PlanGate>
  );
}
