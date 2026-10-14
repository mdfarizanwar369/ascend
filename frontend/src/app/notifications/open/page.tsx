import { Suspense } from "react";
import { NotificationOpenClient } from "@/components/notifications/NotificationOpenClient";
export default function NotificationOpenPage() {
  return <Suspense fallback={<p className="p-6 text-zinc-300">Opening Ascend…</p>}><NotificationOpenClient /></Suspense>;
}
