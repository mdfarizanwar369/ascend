import { AppShell } from "@/components/AppShell";
import { BodyCompositionClient } from "@/components/athlete/BodyCompositionClient";

export default function AthleteBodyCompositionPage() {
  return (
    <AppShell active="client">
      <BodyCompositionClient />
    </AppShell>
  );
}
