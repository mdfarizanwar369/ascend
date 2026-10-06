"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { usePathname } from "next/navigation";
import { canUseHealthConnect } from "@/lib/healthConnect";
import { runHealthConnectSync, shouldAutoSyncHealthConnect } from "@/lib/healthSyncClient";
import { AppleHealth,hasAppleHealthBridge,runAppleHealthSync } from "@/lib/appleHealth";
import { getFirebaseClientAuth,waitForFirebasePersistence } from "@/lib/firebase";

const AUTH_APP_PREFIXES = ["/dashboard", "/trainer", "/admin", "/profile", "/athlete", "/food-log", "/weight-log", "/water-log", "/burn-log", "/coach", "/messages", "/progress", "/reports", "/habits", "/subscription"];

export function HealthSyncCoordinator() {
  const pathname = usePathname();

  useEffect(() => {
    const apple = hasAppleHealthBridge();
    if (!apple && !canUseHealthConnect()) return;
    let cancelled = false;
    let unsubscribe = () => {};
    let listener: PluginListenerHandle | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const authenticatedPath = Boolean(pathname && AUTH_APP_PREFIXES.some(prefix => pathname.startsWith(prefix)));
    const sync = () => {
      if (cancelled || !authenticatedPath) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const work = apple ? runAppleHealthSync() : shouldAutoSyncHealthConnect().then(ready => ready ? runHealthConnectSync({ interactive:false }) : undefined);
        void work.catch(() => window.dispatchEvent(new Event("ascend:health-sync-error")));
      },2000);
    };
    const visible = () => { if (document.visibilityState === "visible") sync(); };
    void App.addListener("appStateChange",state => { if (state.isActive) sync(); }).then(handle => {
      if (cancelled) void handle.remove(); else listener = handle;
    }).catch(() => undefined);
    document.addEventListener("visibilitychange",visible);
    window.addEventListener("focus",sync);
    if (apple) void waitForFirebasePersistence().then(() => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(),user => {
        if (!user) void AppleHealth.disconnect().catch(() => undefined);
        else sync();
      });
    }).catch(() => undefined);
    sync();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      if (listener) void listener.remove();
      document.removeEventListener("visibilitychange",visible);
      window.removeEventListener("focus",sync);
    };
  }, [pathname]);

  return null;
}
