"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { getNativeCapacitorPlatform } from "@/lib/nativePlatform";
import { ascendSiri } from "@/lib/ascendSiri";

export function AscendSiriCoordinator() {
  useEffect(() => {
    if (getNativeCapacitorPlatform() !== "ios") return;
    return onAuthStateChanged(getFirebaseClientAuth(), () => {
      void ascendSiri.status().then(status => {
        if (status.connected && status.firebaseUid !== getFirebaseClientAuth().currentUser?.uid) return ascendSiri.disconnect();
      }).catch(() => { /* Older iPhone builds do not have the Siri bridge. */ });
    });
  }, []);
  return null;
}
