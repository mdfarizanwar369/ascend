import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitleKey="access.businessOnly"
        fallbackMessageKey="access.businessOpsDenied"
      >
        <AdminDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
