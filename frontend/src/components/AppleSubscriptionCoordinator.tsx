"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { usePathname } from "next/navigation";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { AppleBilling, supportsAppleBilling, syncAppleTransactions } from "@/lib/appleBilling";

export function AppleSubscriptionCoordinator() {
  const pathname = usePathname();
  useEffect(() => {
    if (!supportsAppleBilling()) return;
    let stopped = false;
    let running = false;
    let removeListener: (() => Promise<void>) | undefined;
    const sync = () => {
      if (stopped || running || !getFirebaseClientAuth().currentUser) return;
      running = true;
      void syncAppleTransactions().catch(() => { /* Unfinished purchases remain available for an explicit restore. */ }).finally(() => { running = false; });
    };
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), sync);
    void AppleBilling.addListener("transactionsUpdated", sync).then(handle => {
      if (stopped) void handle.remove();
      else removeListener = () => handle.remove();
    }).catch(() => { /* Restore remains available if the native listener could not attach. */ });
    const foreground = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { stopped = true; unsubscribe(); void removeListener?.(); document.removeEventListener("visibilitychange", foreground); };
  }, [pathname]);
  return null;
}
