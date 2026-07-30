import { RoleGate } from "@/components/RoleGate";
import { TrainerSessionCaptureClient } from "@/components/trainer/TrainerSessionCaptureClient";

export default async function TrainerSessionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <RoleGate allowedRoles={["trainer", "admin", "owner"]} fallbackTitle="Trainer access only" fallbackMessage="This account cannot record client sessions." requiredPlan="trainer_pro" planFeature="Trainer session capture"><TrainerSessionCaptureClient clientId={clientId} /></RoleGate>;
}
