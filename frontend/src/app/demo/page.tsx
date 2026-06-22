import type { Metadata } from "next";
import { AscendDemoExperience } from "@/components/demo/AscendDemoExperience";

export const metadata: Metadata = {
  title: "Ascend in 30 Seconds | Fitness Accountability",
  description: "See how Ascend connects members, trainers, and gyms between training sessions.",
  alternates: { canonical: "https://demo.getascend.fit" },
  openGraph: {
    title: "Ascend in 30 Seconds",
    description: "The missing link between training and results.",
    url: "https://demo.getascend.fit",
    siteName: "Ascend"
  }
};

export default function DemoPage() {
  return <AscendDemoExperience />;
}
