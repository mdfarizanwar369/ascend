import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerCoachingTimelineHistoryClient } from "@/components/trainer/TrainerCoachingTimelineHistoryClient";

export default async function TrainerClientCoachingTimelinePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot view client coaching history. Use a trainer, owner, or admin login."
        requiredPlan="trainer_pro"
        planFeature="Trainer coaching timeline"
      >
        <TrainerCoachingTimelineHistoryClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
