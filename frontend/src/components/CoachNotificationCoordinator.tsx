"use client";

import { Bell, Check, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  COACH_NOTIFICATION_ELIGIBLE_EVENT,
  enableCoachNotifications,
  initializeNativeCoachNotificationRouting,
  listenForForegroundCoachMessages,
  postponeCoachNotifications,
  recordDailyNotificationActivity,
  refreshNativeCoachNotificationToken,
  shouldOfferCoachNotifications
} from "@/lib/coachNotifications";
import { INSTALL_ELIGIBLE_EVENT, readInstallValue, installStorageKeys } from "@/lib/installAscend";

function isAppPath(pathname: string) {
  return !new Set(["/", "/login", "/launch", "/reset", "/onboarding", "/privacy", "/terms", "/refund-policy"]).has(pathname);
}

export function CoachNotificationCoordinator() {
  const pathname = usePathname();
  const [eligible, setEligible] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [foregroundMessage, setForegroundMessage] = useState<{ title: string; body: string; href: string } | null>(null);

  useEffect(() => {
    if (!isAppPath(pathname)) return;
    recordDailyNotificationActivity(pathname).catch(() => undefined);
    initializeNativeCoachNotificationRouting().catch(() => undefined);
    refreshNativeCoachNotificationToken().catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    setEligible(Boolean(readInstallValue(installStorageKeys.eligible)));
    const markEligible = () => setEligible(true);
    window.addEventListener(INSTALL_ELIGIBLE_EVENT, markEligible);
    window.addEventListener(COACH_NOTIFICATION_ELIGIBLE_EVENT, markEligible);
    return () => {
      window.removeEventListener(INSTALL_ELIGIBLE_EVENT, markEligible);
      window.removeEventListener(COACH_NOTIFICATION_ELIGIBLE_EVENT, markEligible);
    };
  }, []);

  useEffect(() => {
    if (!eligible || !isAppPath(pathname) || !shouldOfferCoachNotifications()) return;
    const timeout = window.setTimeout(() => setBannerOpen(true), 1400);
    return () => window.clearTimeout(timeout);
  }, [eligible, pathname]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenForForegroundCoachMessages((payload) => {
      setForegroundMessage(payload);
      window.setTimeout(() => setForegroundMessage(null), 5000);
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    }).catch(() => undefined);
    return () => cleanup?.();
  }, []);

  const showBanner = useMemo(() => bannerOpen && isAppPath(pathname), [bannerOpen, pathname]);

  async function enable() {
    setStatus("Turning on coach check-ins...");
    try {
      await enableCoachNotifications();
      setStatus("Coach check-ins are on.");
      window.setTimeout(() => setBannerOpen(false), 900);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not enable notifications.");
    }
  }

  function dismiss() {
    postponeCoachNotifications();
    setBannerOpen(false);
  }

  return (
    <>
      {showBanner ? (
        <aside className="fixed inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-[85] mx-auto max-w-md rounded-lg border border-calm/40 bg-surface p-4 text-white shadow-2xl shadow-black/40">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-calm text-ink"><Bell size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Coach check-ins</p>
              <p className="mt-1 text-sm leading-5 text-zinc-300">Get calm, useful nudges only when Ascend can genuinely help.</p>
              {status ? <p className="mt-2 text-xs text-zinc-400">{status}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={enable} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-calm text-sm font-semibold text-ink"><Check size={16} /> Enable</button>
                <button type="button" onClick={dismiss} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm font-semibold text-zinc-300"><X size={16} /> Not now</button>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {foregroundMessage ? (
        <a href={foregroundMessage.href} className="fixed inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-[90] mx-auto block max-w-md rounded-lg border border-calm/40 bg-surface p-4 text-white shadow-2xl shadow-calm/10">
          <p className="text-sm font-semibold text-calm">{foregroundMessage.title}</p>
          <p className="mt-1 text-sm leading-5 text-zinc-300">{foregroundMessage.body}</p>
        </a>
      ) : null}
    </>
  );
}
