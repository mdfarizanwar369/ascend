import { AppShell } from "@/components/AppShell";
import { FounderDashboardClient } from "@/components/founder/FounderDashboardClient";

export default function FounderPage() {
  return (
    <AppShell active="founder">
      <FounderDashboardClient />
    </AppShell>
  );
}
