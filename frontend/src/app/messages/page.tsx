import { MessagesClient } from "@/components/messages/MessagesClient";
import { PlanGate } from "@/components/PlanGate";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const params = await searchParams;
  return (
    <PlanGate requiredPlan="premium" featureKey="premium.trainerMessaging">
      <MessagesClient initialContactId={params.userId} />
    </PlanGate>
  );
}
