import { CoachHubClient } from "@/components/coach/CoachHubClient";

export default async function CoachPage({
  searchParams
}: {
  searchParams?: Promise<{ workout?: string }> | { workout?: string };
}) {
  const params = searchParams ? await searchParams : {};
  return <CoachHubClient openWorkout={params.workout === "1"} />;
}
