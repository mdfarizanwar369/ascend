import { AdminReferralsClient } from "@/components/admin/AdminReferralsClient";
import { AppShell } from "@/components/AppShell";

export default function AdminReferralsPage() {
  return (
    <AppShell active="admin">
      <AdminReferralsClient />
    </AppShell>
  );
}
