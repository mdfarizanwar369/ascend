"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { nudgeUuid, safeNotificationHref } from "@ascend/shared";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { openSmartNudge } from "@/lib/ascendApi";
import { rememberNotificationLogin } from "@/lib/notificationNavigation";

export function NotificationOpenClient() {
  const id = useSearchParams().get("id");
  const [message, setMessage] = useState("Opening your reminder…");
  const [fallback, setFallback] = useState("/dashboard");
  useEffect(() => {
    let disposed = false; let unsubscribe = () => {}; let generation = 0;
    if (!id || !nudgeUuid.test(id)) { setMessage("This reminder link is not available."); return; }
    void waitForFirebasePersistence().then(() => {
      if (disposed) return;
      const auth = getFirebaseClientAuth();
      unsubscribe = onAuthStateChanged(auth, user => {
        const current = ++generation;
        if (!user) {
          rememberNotificationLogin(id);
          window.location.replace(`/login?notification=${id}`); return;
        }
        const uid = user.uid;
        void openSmartNudge(id).then(result => {
          if (disposed || current !== generation || auth.currentUser?.uid !== uid) return;
          const href = safeNotificationHref(result.href);
          if (result.available) window.location.replace(href);
          else { setFallback(href); setMessage("This reminder has expired or is no longer available for this account."); }
        }).catch(() => { if (!disposed && current === generation) setMessage("Could not open this reminder. You can continue in Ascend."); });
      });
    }).catch(() => { if (!disposed) setMessage("Please sign in to open Ascend."); });
    return () => { disposed = true; generation++; unsubscribe(); };
  }, [id]);
  return <main className="ascend-page min-h-screen px-5 py-12 text-white"><div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
    <h1 className="text-xl font-semibold">Your Ascend reminder</h1><p role="status" className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
    <Link href={fallback} className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink">Continue in Ascend</Link>
  </div></main>;
}
