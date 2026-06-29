"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { canUseHealthConnect } from "@/lib/healthConnect";
import { runHealthConnectSync, shouldAutoSyncHealthConnect } from "@/lib/healthSyncClient";

const AUTH_APP_PREFIXES = ["/dashboard", "/trainer", "/admin", "/profile", "/athlete", "/food-log", "/weight-log", "/water-log", "/burn-log", "/coach", "/messages", "/progress", "/reports", "/habits", "/subscription"];

export function HealthSyncCoordinator() {
  const hasRunRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (hasRunRef.current) return;
    if (!canUseHealthConnect()) return;
    if (!pathname || !AUTH_APP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

    hasRunRef.current = true;

    const timer = window.setTimeout(() => {
      void shouldAutoSyncHealthConnect()
        .then((shouldSync) => {
          if (!shouldSync) return;
          return runHealthConnectSync({ interactive: false }).catch(() => undefined);
        })
        .catch(() => undefined);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
