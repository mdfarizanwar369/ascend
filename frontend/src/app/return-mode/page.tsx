import type { Metadata } from "next";
import { ReturnModeClient } from "@/components/return-mode/ReturnModeClient";

export const metadata: Metadata = {
  title: "Welcome back | Ascend",
  robots: { index: false, follow: false }
};

export default function ReturnModePage() {
  return <ReturnModeClient />;
}
