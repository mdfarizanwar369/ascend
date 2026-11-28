import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAscendNativeUserAgent, supportsAscendIosCycle } from "@ascend/shared";
import { CycleTracker } from "@/components/profile/CycleTracker";
import { cycleTrackingEnabled } from "@/lib/cycleTrackingFlag";

export default async function CycleTrackerPage() {
  if (!cycleTrackingEnabled) notFound();
  const request = await headers();
  const agent = request.get("user-agent") ?? "";
  if (!supportsAscendIosCycle(agent) &&
    (isAscendNativeUserAgent(agent) || request.get("x-ascend-edition")?.startsWith("ios-"))) notFound();
  return <CycleTracker />;
}
