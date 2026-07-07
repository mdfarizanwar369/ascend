import { CoachHubClient } from "@/components/coach/CoachHubClient";
import { PlanGate } from "@/components/PlanGate";

export default function CoachPage() {
  return (
    <PlanGate requiredPlan="premium" feature="Coach Zoe">
      <CoachHubClient />
    </PlanGate>
  );
}
