import { RoleGate } from "@/components/RoleGate";
import { TrainerSessionCaptureClient } from "@/components/trainer/TrainerSessionCaptureClient";

export default async function TrainerSessionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <RoleGate
      allowedRoles={["trainer", "admin", "owner"]}
      fallbackTitleKey="access.trainerOnly"
      fallbackMessageKey="access.trainerSessionDenied"
      requiredPlan="trainer_pro"
      planFeatureKey="trainer.sessionFeature"
    >
      <TrainerSessionCaptureClient clientId={clientId} />
    </RoleGate>
  );
}
