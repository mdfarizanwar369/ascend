import { AppShell } from "@/components/AppShell";
import { FounderDashboardClient } from "@/components/founder/FounderDashboardClient";
import { RoleGate } from "@/components/RoleGate";

export default function FounderPage() {
  return (
    <AppShell active="founder">
      <RoleGate
        allowedRoles={["owner"]}
        requirePlatformOwner
        fallbackTitleKey="access.founderOnly"
        fallbackMessageKey="access.founderDenied"
      >
        <FounderDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
