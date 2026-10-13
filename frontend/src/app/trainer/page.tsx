import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerActionDesk } from "@/components/trainer/TrainerActionDesk";

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account is a client account. Use a trainer, owner, or admin login to view assigned clients."
        requiredPlan="trainer_pro"
        planFeature="Trainer dashboard"
      >
        <TrainerActionDesk />
      </RoleGate>
    </AppShell>
  );
}
