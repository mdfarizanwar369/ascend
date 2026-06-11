import { ProgressPhotosClient } from "@/components/progress/ProgressPhotosClient";
import { PlanGate } from "@/components/PlanGate";

export default function ProgressPage() {
  return (
    <PlanGate requiredPlan="premium" feature="Progress photos">
      <ProgressPhotosClient />
    </PlanGate>
  );
}
