"use client";

import { onAuthStateChanged, type Auth } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { clearLocalAscendSession } from "@/lib/authSession";
import { isPublicAuthPath, loginUrlFor } from "@/lib/authReturn";

export function AuthStateGuard() {
  const lastUidRef = useRef<string | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let auth: Auth;
    let cancelled = false;
    let unsubscribe = () => {};
    if (isPublicAuthPath(window.location.pathname)) return;
    setChecking(true);

    try {
      auth = getFirebaseClientAuth();
    } catch {
      return;
    }

    async function beginAuthGuard() {
      await waitForFirebasePersistence();
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (cancelled) return;
        const nextUid = user?.uid ?? null;
        const previousUid = lastUidRef.current;
        lastUidRef.current = nextUid;

        if (previousUid && nextUid && previousUid !== nextUid) {
          window.location.reload();
          return;
        }
        if (!nextUid) {
          const destination = loginUrlFor(window.location.pathname, window.location.search);
          void clearLocalAscendSession().finally(() => window.location.replace(destination));
          return;
        }
        setChecking(false);
      });
    }

    void beginAuthGuard().catch(() => {
      const destination = loginUrlFor(window.location.pathname, window.location.search);
      void clearLocalAscendSession().finally(() => window.location.replace(destination));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!checking) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/95 px-6" role="status" aria-live="polite">
      <div className="rounded-lg border border-line bg-surface px-6 py-5 text-center shadow-xl">
        <p className="text-sm font-semibold text-[rgb(var(--color-text-strong))]">Checking your secure session...</p>
        <p className="mt-1 text-xs text-[rgb(var(--color-text-muted))]">You will return to this page after signing in.</p>
      </div>
    </div>
  );
}
