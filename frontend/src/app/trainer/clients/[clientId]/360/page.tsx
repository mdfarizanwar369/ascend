import { AppShell } from "@/components/AppShell";
import { AscendCoachGate } from "@/components/AscendCoachGate";
import { Client360Client } from "@/components/trainer/Client360Client";

export default async function Client360Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <AppShell active="trainer">
      <AscendCoachGate>
        <Client360Client clientId={clientId} />
      </AscendCoachGate>
    </AppShell>
  );
}
