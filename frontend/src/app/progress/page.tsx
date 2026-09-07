import { ProgressPhotosClient } from "@/components/progress/ProgressPhotosClient";
import { PlanGate } from "@/components/PlanGate";

export default function ProgressPage() {
  return (
    <PlanGate requiredPlan="premium" featureKey="premium.progressPhotos">
      <ProgressPhotosClient />
    </PlanGate>
  );
}
