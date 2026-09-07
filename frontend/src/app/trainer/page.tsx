import { AppShell } from "@/components/AppShell";
import { AscendCoachGate } from "@/components/AscendCoachGate";
import { RoleGate } from "@/components/RoleGate";
import { TrainerCoachCta } from "@/components/trainer/TrainerCoachCta";
import { TrainerDashboardClient } from "@/components/trainer/TrainerDashboardClient";

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitleKey="access.trainerOnly"
        fallbackMessageKey="access.trainerDashboardDenied"
        requiredPlan="trainer_pro"
        planFeatureKey="trainer.dashboardFeature"
      >
        <AscendCoachGate hideWhenDenied>
          <TrainerCoachCta />
        </AscendCoachGate>
        <TrainerDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
