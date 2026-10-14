import { BurnLogClient } from "@/components/tracking/BurnLogClient";

export default async function BurnLogPage({ searchParams }: { searchParams?: Promise<{ schedule?: string }> }) {
  const params = await searchParams;
  return <BurnLogClient scheduleId={params?.schedule} />;
}
