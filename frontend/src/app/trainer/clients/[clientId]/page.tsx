import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { RoleGate } from "@/components/RoleGate";
import { TrainerClientDetailClient } from "@/components/trainer/TrainerClientDetailClient";

export default async function TrainerClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot view client trainer records. Use a trainer, owner, or admin login."
      >
        <PlanGate requiredPlan="trainer_pro" feature="Trainer client profile" fallbackHref="/trainer">
          <TrainerClientDetailClient clientId={clientId} />
        </PlanGate>
      </RoleGate>
    </AppShell>
  );
}
