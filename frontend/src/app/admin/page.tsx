import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AppShell } from "@/components/AppShell";

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <AdminDashboardClient />
    </AppShell>
  );
}
