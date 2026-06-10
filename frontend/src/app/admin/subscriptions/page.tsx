import { AdminSubscriptionsClient } from "@/components/admin/AdminSubscriptionsClient";
import { AppShell } from "@/components/AppShell";

export default function AdminSubscriptionsPage() {
  return (
    <AppShell active="admin">
      <AdminSubscriptionsClient />
    </AppShell>
  );
}
