import { MessagesClient } from "@/components/messages/MessagesClient";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const params = await searchParams;
  return <MessagesClient initialContactId={params.userId} />;
}
