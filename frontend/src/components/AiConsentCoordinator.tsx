"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { AiConsentStatus } from "@ascend/shared";
import { AiPrivacySettings } from "./AiPrivacySettings";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { api } from "@/lib/api";

const publicPaths = new Set(["/", "/login", "/launch", "/reset", "/onboarding", "/privacy", "/terms", "/contact", "/delete-account", "/refund-policy", "/ai-privacy", "/privacy/ios", "/terms/ios", "/refund-policy/ios"]);

export function AiConsentCoordinator() {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ uid: string; consent: AiConsentStatus } | null>(null);
  useEffect(() => {
    if (publicPaths.has(pathname)) return;
    let revision = 0;
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async user => {
      const current = ++revision;
      setPending(null);
      if (!user) return;
      try {
        const result = await api<{ consent: AiConsentStatus }>("/me/ai-consent", {}, await user.getIdToken());
        if (current !== revision) return;
        if (result.consent.provider && result.consent.decision === null) setPending({ uid: user.uid, consent: result.consent });
      } catch { /* Server permission remains off if the choice cannot load. */ }
    });
    return () => { revision++; unsubscribe(); };
  }, [pathname]);

  if (!pending || publicPaths.has(pathname)) return null;
  return <aside aria-label="AI permission request" className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 px-4 py-[max(1rem,env(safe-area-inset-top))]">
    <div className="mx-auto max-w-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
      <AiPrivacySettings key={pending.uid} consent={pending.consent} onChange={() => setPending(null)} />
      <button type="button" className="mt-3 min-h-12 w-full rounded-lg border border-line bg-surface p-3 text-white" onClick={() => setPending(null)}>Decide later — keep AI off</button>
    </div>
  </aside>;
}
