import { AppShell } from "@/components/AppShell";
import { AdminUserDetailClient } from "@/components/admin/AdminUserDetailClient";
import { RoleGate } from "@/components/RoleGate";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  return (
    <AppShell active="admin">
      <RoleGate
        allowedRoles={["admin", "owner"]}
        fallbackTitleKey="access.businessOnly"
        fallbackMessageKey="access.businessUsersDenied"
      >
        <AdminUserDetailClient userId={userId} />
      </RoleGate>
    </AppShell>
  );
}
