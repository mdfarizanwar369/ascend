import { AppShell } from "@/components/AppShell";
import { TrainerDashboardClient } from "@/components/trainer/TrainerDashboardClient";

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <TrainerDashboardClient />
    </AppShell>
  );
}
