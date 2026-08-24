import type { Metadata } from "next";
import { AscendDemoExperience } from "@/components/demo/AscendDemoExperience";

export const metadata: Metadata = {
  title: "Ascend Live Product Tour | The Other 166 Hours",
  description: "See the current Ascend experience across Today's Essentials, meal logging, Coach Zoe, workouts, Journey, Body Scan, trainers, and gym owners.",
  alternates: { canonical: "https://www.getascend.fit/demo" },
  openGraph: {
    title: "Ascend Live Product Tour",
    description: "A current product walkthrough of how Ascend turns daily actions into better coaching between sessions.",
    url: "https://www.getascend.fit/demo",
    siteName: "Ascend"
  }
};

export default function DemoPage() {
  return <AscendDemoExperience />;
}
