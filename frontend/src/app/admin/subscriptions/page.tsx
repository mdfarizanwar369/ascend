import { AdminSubscriptionsClient } from "@/components/admin/AdminSubscriptionsClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminSubscriptionsPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitleKey="access.businessOnly"
        fallbackMessageKey="access.businessSubscriptionsDenied"
      >
        <AdminSubscriptionsClient />
      </RoleGate>
    </AppShell>
  );
}
