import { CoachClient } from "@/components/coach/CoachClient";
import { PlanGate } from "@/components/PlanGate";

export default function CoachPage() {
  return (
    <PlanGate requiredPlan="premium" feature="AI nutrition coach">
      <CoachClient />
    </PlanGate>
  );
}
