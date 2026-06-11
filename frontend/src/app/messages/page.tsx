import { MessagesClient } from "@/components/messages/MessagesClient";
import { PlanGate } from "@/components/PlanGate";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const params = await searchParams;
  return (
    <PlanGate requiredPlan="premium" feature="Trainer messaging">
      <MessagesClient initialContactId={params.userId} />
    </PlanGate>
  );
}
