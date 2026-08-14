import type { Metadata } from "next";
import { AscendDemoExperience } from "@/components/demo/AscendDemoExperience";

export const metadata: Metadata = {
  title: "Ascend Live Product Tour | The Other 166 Hours",
  description: "See a slower, screenshot-led walkthrough of how Ascend supports members, Coach Zoe, trainers, Athlete Mode, and gym owners between sessions.",
  alternates: { canonical: "https://www.getascend.fit/demo" },
  openGraph: {
    title: "Ascend Live Product Tour",
    description: "A real-product walkthrough of how Ascend covers the other 166 hours between sessions.",
    url: "https://www.getascend.fit/demo",
    siteName: "Ascend"
  }
};

export default function DemoPage() {
  return <AscendDemoExperience />;
}
