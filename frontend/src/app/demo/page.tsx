import type { Metadata } from "next";
import { AscendDemoExperience } from "@/components/demo/AscendDemoExperience";

export const metadata: Metadata = {
  title: "Ascend in 30 Seconds | The Other 166 Hours",
  description: "See how Ascend connects members, Coach Zoe, trainers, Athlete Mode, and gym owners between training sessions.",
  alternates: { canonical: "https://demo.getascend.fit" },
  openGraph: {
    title: "Ascend in 30 Seconds",
    description: "The trainer coaches for one hour. Ascend covers the other 166.",
    url: "https://demo.getascend.fit",
    siteName: "Ascend"
  }
};

export default function DemoPage() {
  return <AscendDemoExperience />;
}
