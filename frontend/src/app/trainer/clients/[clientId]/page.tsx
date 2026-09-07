import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerClientDetailClient } from "@/components/trainer/TrainerClientDetailClient";

export default async function TrainerClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitleKey="access.trainerOnly"
        fallbackMessageKey="access.trainerClientDenied"
        requiredPlan="trainer_pro"
        planFeatureKey="trainer.clientProfileFeature"
      >
        <TrainerClientDetailClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
