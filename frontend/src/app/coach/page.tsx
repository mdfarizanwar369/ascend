import { CoachClient } from "@/components/coach/CoachClient";
import { CoachHubClient } from "@/components/coach/CoachHubClient";
import { PlanGate } from "@/components/PlanGate";
import { isConsumerTodayV2Enabled } from "@/lib/consumerTodayVersion";

export default function CoachPage() {
  return (
    <PlanGate requiredPlan="premium" feature="Coach Zoe">
      {isConsumerTodayV2Enabled() ? <CoachHubClient /> : <CoachClient />}
    </PlanGate>
  );
}
