import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { Client360Client } from "@/components/trainer/Client360Client";

export default async function Client360Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot open Client 360."
        requiredPlan="trainer_pro"
        planFeature="Client 360"
      >
        <Client360Client clientId={clientId} />
      </RoleGate>
    </AppShell>
  );
}
