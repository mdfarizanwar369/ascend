import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { BodyCompositionClient } from "@/components/athlete/BodyCompositionClient";

export default async function TrainerBodyCompositionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot view client athlete records. Use a trainer, owner, or admin login."
        requiredPlan="trainer_pro"
        planFeature="Body composition coaching"
      >
        <BodyCompositionClient clientId={clientId} coachView />
      </RoleGate>
    </AppShell>
  );
}
