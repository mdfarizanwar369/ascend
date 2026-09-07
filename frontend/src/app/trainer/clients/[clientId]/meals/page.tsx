import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerMealHistoryClient } from "@/components/trainer/TrainerMealHistoryClient";

export default async function TrainerClientMealHistoryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitleKey="access.trainerOnly"
        fallbackMessageKey="access.trainerMealsDenied"
        requiredPlan="trainer_pro"
        planFeatureKey="trainer.mealHistoryFeature"
      >
        <TrainerMealHistoryClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
