import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { BodyCompositionClient } from "@/components/athlete/BodyCompositionClient";

export default async function TrainerBodyCompositionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitleKey="access.trainerOnly"
        fallbackMessageKey="access.trainerBodyDenied"
        requiredPlan="trainer_pro"
        planFeatureKey="trainer.bodyCompositionFeature"
      >
        <BodyCompositionClient clientId={clientId} coachView />
      </RoleGate>
    </AppShell>
  );
}
