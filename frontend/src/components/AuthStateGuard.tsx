"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef } from "react";
import { getFirebaseClientAuth } from "@/lib/firebase";

export function AuthStateGuard() {
  const lastUidRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const auth = getFirebaseClientAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid ?? null;
      const previousUid = lastUidRef.current;
      lastUidRef.current = nextUid;

      if (previousUid && nextUid && previousUid !== nextUid && window.location.pathname !== "/login") {
        window.location.reload();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}
