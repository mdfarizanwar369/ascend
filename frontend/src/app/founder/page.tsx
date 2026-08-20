import { AppShell } from "@/components/AppShell";
import { FounderDashboardClient } from "@/components/founder/FounderDashboardClient";
import { RoleGate } from "@/components/RoleGate";

export default function FounderPage() {
  return (
    <AppShell active="founder">
      <RoleGate
        allowedRoles={["owner"]}
        requirePlatformOwner
        fallbackTitle="Founder access only"
        fallbackMessage="This private workspace is available only to the Ascend platform owner."
      >
        <FounderDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
