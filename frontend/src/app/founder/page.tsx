import { AppShell } from "@/components/AppShell";
import { FounderDashboardClient } from "@/components/founder/FounderDashboardClient";
import { RoleGate } from "@/components/RoleGate";
import Link from "next/link";

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
        <Link href="/founder/message-reports" className="mx-4 mb-8 inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-calm">Review message reports</Link>
      </RoleGate>
    </AppShell>
  );
}
