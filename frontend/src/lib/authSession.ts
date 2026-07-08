"use client";

import { signOut } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { clearCachedAccountProfile } from "@/lib/accountSession";
import { disableCoachNotifications } from "@/lib/coachNotifications";

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), ms);
    })
  ]);
}

export async function clearLocalAscendSession() {
  clearCachedAccountProfile();
  window.sessionStorage.clear();

  try {
    const { isNativeAndroidCapacitor } = await import("@/lib/nativePlatform");
    const cleanupTasks: Promise<unknown>[] = [
      withTimeout(disableCoachNotifications(), 2_500).catch(() => undefined),
      withTimeout(signOut(getFirebaseClientAuth()), 4_000).catch(() => undefined)
    ];

    if (isNativeAndroidCapacitor()) {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      cleanupTasks.unshift(withTimeout(FirebaseAuthentication.signOut(), 4_000).catch(() => undefined));
    }

    await Promise.allSettled(cleanupTasks);
  } catch {
    await Promise.allSettled([
      withTimeout(disableCoachNotifications(), 2_500).catch(() => undefined),
      withTimeout(signOut(getFirebaseClientAuth()), 4_000).catch(() => undefined)
    ]);
  }
}
