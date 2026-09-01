import { AppShell } from "@/components/AppShell";
import { AscendCoachGate } from "@/components/AscendCoachGate";
import { AscendCoachClientList } from "@/components/trainer/AscendCoachClientList";

export default function AscendCoachClientsPage() {
  return (
    <AppShell active="trainer">
      <AscendCoachGate>
        <AscendCoachClientList />
      </AscendCoachGate>
    </AppShell>
  );
}
