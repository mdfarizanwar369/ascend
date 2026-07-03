import type { Metadata } from "next";
import { AscendDemoExperience } from "@/components/demo/AscendDemoExperience";

export const metadata: Metadata = {
  title: "Ascend Live Product Tour | The Other 166 Hours",
  description: "See a slower, screenshot-led walkthrough of how Ascend supports members, Coach Zoe, trainers, Athlete Mode, and gym owners between sessions.",
  alternates: { canonical: "https://demo.getascend.fit" },
  openGraph: {
    title: "Ascend Live Product Tour",
    description: "A real-product walkthrough of how Ascend covers the other 166 hours between sessions.",
    url: "https://demo.getascend.fit",
    siteName: "Ascend"
  }
};

export default function DemoPage() {
  return <AscendDemoExperience />;
}
