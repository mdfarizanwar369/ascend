import { RoleGate } from "@/components/RoleGate";
import { TrainerSessionCaptureClient } from "@/components/trainer/TrainerSessionCaptureClient";

export default async function TrainerSessionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <RoleGate allowedRoles={["trainer"]} fallbackTitle="Trainer access only" fallbackMessage="Use a trainer account to record sessions for your assigned clients." requiredPlan="trainer_pro" planFeature="Trainer session capture"><TrainerSessionCaptureClient key={clientId} clientId={clientId} /></RoleGate>;
}
