import { AppShell } from "@/components/AppShell";
import { TrainerClientDetailClient } from "@/components/trainer/TrainerClientDetailClient";

export default async function TrainerClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return (
    <AppShell active="trainer">
      <TrainerClientDetailClient clientId={clientId} />
    </AppShell>
  );
}
