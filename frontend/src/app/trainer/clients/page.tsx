import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { AscendCoachClientList } from "@/components/trainer/AscendCoachClientList";

export default function AscendCoachClientsPage() {
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot open Ascend Coach clients."
        requiredPlan="trainer_pro"
        planFeature="Ascend Coach"
      >
        <AscendCoachClientList />
      </RoleGate>
    </AppShell>
  );
}
