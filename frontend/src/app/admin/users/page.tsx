import { AppShell } from "@/components/AppShell";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { RoleGate } from "@/components/RoleGate";

export default function AdminUsersPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitleKey="access.businessOnly"
        fallbackMessageKey="access.businessUsersDenied"
      >
        <AdminUsersClient />
      </RoleGate>
    </AppShell>
  );
}
