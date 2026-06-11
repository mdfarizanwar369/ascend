import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerDashboardClient } from "@/components/trainer/TrainerDashboardClient";

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account is a client account. Use a trainer, owner, or admin login to view assigned clients."
      >
        <TrainerDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
