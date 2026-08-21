import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Business access only"
        fallbackMessage="This account cannot view club operations. Use an owner or admin login."
      >
        <AdminDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
