import { AppShell } from "@/components/AppShell";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { RoleGate } from "@/components/RoleGate";

export default function AdminUsersPage() {
  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitle="Admin access only"
        fallbackMessage="This account cannot manage users. Use an owner or admin login."
      >
        <AdminUsersClient />
      </RoleGate>
    </AppShell>
  );
}
