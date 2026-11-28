import { notFound } from "next/navigation";
import { CycleTracker } from "@/components/profile/CycleTracker";
import { cycleTrackingEnabled } from "@/lib/cycleTrackingFlag";

export default function CycleTrackerPage() {
  if (!cycleTrackingEnabled) notFound();
  return <CycleTracker />;
}
