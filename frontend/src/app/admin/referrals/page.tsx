import { AdminReferralsClient } from "@/components/admin/AdminReferralsClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminReferralsPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Business access only"
        fallbackMessage="This account cannot view referral attribution. Use an owner or admin login."
      >
        <AdminReferralsClient />
      </RoleGate>
    </AppShell>
  );
}
