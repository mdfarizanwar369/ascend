"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef } from "react";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";

type AuthStateAction = "reload" | "login" | null;

export function authStateAction(
  previousUid: string | null | undefined,
  nextUid: string | null,
  pathname: string
): AuthStateAction {
  if (pathname === "/login") return null;
  if (!nextUid) return "login";
  if (previousUid && previousUid !== nextUid) return "reload";
  return null;
}

export function AuthStateGuard() {
  const lastUidRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};
    const publicPaths = new Set(["/", "/login", "/launch", "/reset", "/privacy", "/terms", "/refund-policy", "/contact", "/delete-account"]);
    if (publicPaths.has(window.location.pathname)) return;

    async function observeAuth() {
      try {
        await waitForFirebasePersistence();
        if (cancelled) return;

        const auth = getFirebaseClientAuth();
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (cancelled) return;
          const nextUid = user?.uid ?? null;
          const previousUid = lastUidRef.current;
          lastUidRef.current = nextUid;
          const action = authStateAction(previousUid, nextUid, window.location.pathname);

          if (action === "reload") window.location.reload();
          if (action === "login") window.location.replace("/login");
        });
      } catch {
        if (!cancelled) window.location.replace("/login");
      }
    }

    void observeAuth();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return null;
}
