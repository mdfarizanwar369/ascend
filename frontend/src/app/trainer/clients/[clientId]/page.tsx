import { AppShell } from "@/components/AppShell";
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
        requiredPlan="trainer_pro"
        planFeature="Trainer client profile"
      >
        <TrainerClientDetailClient clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
