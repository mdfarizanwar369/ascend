"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { AppleBilling, supportsAppleBilling, syncAppleTransactions } from "@/lib/appleBilling";

export function AppleSubscriptionCoordinator() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!supportsAppleBilling()) return;
    let stopped = false;
    let running = false;
    const removeListeners: Array<() => Promise<void>> = [];
    const sync = () => {
      if (stopped || !getFirebaseClientAuth().currentUser) return;
      void AppleBilling.getPurchaseIntent().then(intent => {
        if (!stopped && intent.productId && pathname !== "/subscription") router.push("/subscription");
      }).catch(() => { /* The customer can also open Subscriptions from Profile. */ });
      if (running) return;
      running = true;
      void syncAppleTransactions().catch(() => { /* Unfinished purchases remain available for an explicit restore. */ }).finally(() => { running = false; });
    };
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), sync);
    for (const event of ["transactionsUpdated", "purchaseIntent"] as const) {
      void AppleBilling.addListener(event, sync).then(handle => {
        if (stopped) void handle.remove();
        else removeListeners.push(() => handle.remove());
      }).catch(() => { /* Restore remains available if the native listener could not attach. */ });
    }
    const foreground = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { stopped = true; unsubscribe(); removeListeners.forEach(remove => { void remove(); }); document.removeEventListener("visibilitychange", foreground); };
  }, [pathname, router]);
  return null;
}
