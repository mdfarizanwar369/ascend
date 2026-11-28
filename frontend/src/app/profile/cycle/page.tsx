import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAscendNativeUserAgent } from "@ascend/shared";
import { CycleTracker } from "@/components/profile/CycleTracker";
import { cycleTrackingEnabled } from "@/lib/cycleTrackingFlag";

export default async function CycleTrackerPage() {
  if (!cycleTrackingEnabled) notFound();
  const request = await headers();
  if (isAscendNativeUserAgent(request.get("user-agent") ?? "") ||
      request.get("x-ascend-edition")?.startsWith("ios-")) notFound();
  return <CycleTracker />;
}
