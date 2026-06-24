"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { enableCoachNotifications } from "@/lib/coachNotifications";

export function EnableCoachNotificationsButton() {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  async function enable() {
    setWorking(true);
    setStatus("Turning on coach check-ins...");
    try {
      await enableCoachNotifications();
      setStatus("Coach check-ins are enabled on this device.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not enable coach check-ins.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={enable} disabled={working} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-calm/40 bg-calm/10 text-sm font-semibold text-calm disabled:opacity-60">
        <Bell size={17} /> {working ? "Enabling..." : "Enable coach check-ins"}
      </button>
      {status ? <p className="mt-2 text-xs leading-5 text-zinc-400">{status}</p> : null}
    </div>
  );
}
