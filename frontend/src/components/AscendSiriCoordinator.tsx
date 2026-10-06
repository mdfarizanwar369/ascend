"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { API_URL } from "@/lib/api";
import { getFirebaseClientAuth,waitForFirebasePersistence } from "@/lib/firebase";
import { getNativeCapacitorPlatform } from "@/lib/nativePlatform";
import { ascendSiri } from "@/lib/ascendSiri";

export function AscendSiriCoordinator() {
  useEffect(() => {
    if (getNativeCapacitorPlatform() !== "ios") return;
    let cancelled = false;
    let revision = 0;
    let unsubscribe = () => {};
    let listener: PluginListenerHandle | null = null;

    async function reconcile() {
      const currentRevision = ++revision;
      try {
        const status = await ascendSiri.status();
        if (cancelled || currentRevision !== revision || !status.supported) return;
        const user = getFirebaseClientAuth().currentUser;
        if (!user) {
          if (status.connected) await ascendSiri.disconnect();
          return;
        }
        if (status.connected && status.firebaseUid !== user.uid) {
          await ascendSiri.disconnect();
          if (cancelled || currentRevision !== revision || getFirebaseClientAuth().currentUser?.uid !== user.uid) return;
        }
        const firebaseToken = await user.getIdToken();
        if (cancelled || currentRevision !== revision || getFirebaseClientAuth().currentUser?.uid !== user.uid) return;
        // Native code reuses a healthy Keychain credential and renews it only
        // when it has less than seven days left, so this remains inexpensive.
        await ascendSiri.connect({ apiBaseUrl:API_URL,firebaseToken,firebaseUid:user.uid });
      } catch { /* Old builds and temporary network failures stay invisible. */ }
    }

    const focus = () => { void reconcile(); };
    void waitForFirebasePersistence().then(() => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(),() => { void reconcile(); });
      window.addEventListener("focus",focus);
      void App.addListener("appStateChange",state => { if (state.isActive) void reconcile(); }).then(handle => {
        if (cancelled) void handle.remove(); else listener = handle;
      }).catch(() => undefined);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      revision++;
      unsubscribe();
      if (listener) void listener.remove();
      window.removeEventListener("focus",focus);
    };
  }, []);
  return null;
}
