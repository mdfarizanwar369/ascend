"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { enableCoachNotifications } from "@/lib/coachNotifications";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function EnableCoachNotificationsButton() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  async function enable() {
    setWorking(true);
    setStatus(t("profile.enablingCoachCheckins"));
    try {
      await enableCoachNotifications();
      setStatus(t("profile.coachCheckinsEnabled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profile.coachCheckinsError"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={enable} disabled={working} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-calm/40 bg-calm/10 text-sm font-semibold text-calm disabled:opacity-60">
        <Bell size={17} /> {working ? t("profile.enabling") : t("profile.enableCoachCheckins")}
      </button>
      {status ? <p className="mt-2 text-xs leading-5 text-zinc-400">{status}</p> : null}
    </div>
  );
}
