"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef } from "react";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";

export function AuthStateGuard() {
  const lastUidRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let auth;
    let isReady = false;
    try {
      auth = getFirebaseClientAuth();
    } catch {
      return;
    }

    waitForFirebasePersistence().then(() => {
      isReady = true;
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid ?? null;
      const previousUid = lastUidRef.current;
      lastUidRef.current = nextUid;

      if (!isReady) return;

      if (previousUid && nextUid && previousUid !== nextUid && window.location.pathname !== "/login") {
        window.location.reload();
      }

      if (previousUid && !nextUid && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}
