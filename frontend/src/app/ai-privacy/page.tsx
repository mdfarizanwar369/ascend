"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AiConsentStatus } from "@ascend/shared";
import { AiPrivacySettings } from "@/components/AiPrivacySettings";
import { BackButton } from "@/components/BackButton";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { api } from "@/lib/api";

export default function AiPrivacyPage() {
  const [state, setState] = useState<{ uid: string; consent: AiConsentStatus } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let revision = 0;
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async user => {
      const current = ++revision;
      setState(null);
      setError("");
      if (!user) { setError("Sign in to manage your AI privacy choice."); return; }
      try {
        const result = await api<{ consent: AiConsentStatus }>("/me/ai-consent", {}, await user.getIdToken());
        if (current === revision) setState({ uid: user.uid, consent: result.consent });
      } catch { if (current === revision) setError("Could not load your choice. Reload to try again; AI sharing has not been enabled."); }
    });
    return () => { revision++; unsubscribe(); };
  }, []);
  return <main className="min-h-screen bg-ink px-4 py-5 text-white"><div className="mx-auto max-w-xl space-y-5">
    <header className="flex items-center gap-3"><BackButton fallbackHref="/profile" /><h1 className="text-2xl font-semibold">AI privacy</h1></header>
    {state ? <AiPrivacySettings key={state.uid} consent={state.consent} onChange={consent => setState({ ...state, consent })} /> : <p role="status">{error || "Loading your privacy choice…"}</p>}
  </div></main>;
}
