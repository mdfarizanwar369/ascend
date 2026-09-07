import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerCoachingTimelineHistoryClient } from "@/components/trainer/TrainerCoachingTimelineHistoryClient";

export default async function TrainerClientCoachingTimelinePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitleKey="access.trainerOnly"
        fallbackMessageKey="access.trainerTimelineDenied"
        requiredPlan="trainer_pro"
        planFeatureKey="trainer.timelineFeature"
      >
        <TrainerCoachingTimelineHistoryClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
