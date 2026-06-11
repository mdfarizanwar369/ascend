import { AdminSubscriptionsClient } from "@/components/admin/AdminSubscriptionsClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminSubscriptionsPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Admin access only"
        fallbackMessage="This account cannot manage subscriptions. Use an owner or admin login."
      >
        <AdminSubscriptionsClient />
      </RoleGate>
    </AppShell>
  );
}
