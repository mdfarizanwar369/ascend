import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerMealHistoryClient } from "@/components/trainer/TrainerMealHistoryClient";

export default async function TrainerClientMealHistoryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot view client meal history. Use a trainer, owner, or admin login."
        requiredPlan="trainer_pro"
        planFeature="Trainer meal history"
      >
        <TrainerMealHistoryClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
