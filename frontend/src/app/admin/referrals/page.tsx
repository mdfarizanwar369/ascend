import { AdminReferralsClient } from "@/components/admin/AdminReferralsClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminReferralsPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitleKey="access.businessOnly"
        fallbackMessageKey="access.businessReferralsDenied"
      >
        <AdminReferralsClient />
      </RoleGate>
    </AppShell>
  );
}
