import { redirect } from "next/navigation";
import { JourneyClient } from "@/components/journey/JourneyClient";
import { isConsumerTodayV2Enabled } from "@/lib/consumerTodayVersion";

export default function JourneyPage() {
  if (!isConsumerTodayV2Enabled()) {
    redirect("/progress");
  }

  return <JourneyClient />;
}
