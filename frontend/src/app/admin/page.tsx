import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Admin access only"
        fallbackMessage="This account cannot view gym revenue or admin analytics. Use an owner or admin login."
      >
        <AdminDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
