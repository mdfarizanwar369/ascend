import { AppShell } from "@/components/AppShell";
import { AthleteDashboardClient } from "@/components/athlete/AthleteDashboardClient";

export default function AthletePage() {
  return (
    <AppShell active="client">
      <AthleteDashboardClient />
    </AppShell>
  );
}
