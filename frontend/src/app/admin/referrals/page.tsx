import { AdminReferralsClient } from "@/components/admin/AdminReferralsClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminReferralsPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Admin access only"
        fallbackMessage="This account cannot view referral revenue. Use an owner or admin login."
      >
        <AdminReferralsClient />
      </RoleGate>
    </AppShell>
  );
}
