"use client";

import { useState } from "react";
import Link from "next/link";
import { AI_DATA_CATEGORIES, AiConsentStatus } from "@ascend/shared";
import { api } from "@/lib/api";
import { getFirebaseToken } from "@/lib/authToken";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { useIosApp } from "@/lib/appEdition";
import { iosAiDataCategories } from "@/lib/iosPrivacyCopy";

export function AiPrivacySettings({ consent, onChange }: { consent: AiConsentStatus; onChange: (consent: AiConsentStatus) => void }) {
  const iosFree = useIosApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accountUid] = useState(() => getFirebaseClientAuth().currentUser?.uid);

  async function choose(allowed: boolean) {
    if (busy || !consent.provider) return;
    setBusy(true);
    setMessage("");
    try {
      // Never apply a displayed choice to a different account after sign-out.
      const token = await getFirebaseToken();
      if (!accountUid || getFirebaseClientAuth().currentUser?.uid !== accountUid) throw new Error("Your account changed. Reload this page before choosing.");
      const result = await api<{ consent: AiConsentStatus }>("/me/ai-consent", {
        method: "PUT", body: JSON.stringify({ provider: consent.provider, version: consent.version, allowed })
      }, token);
      if (getFirebaseClientAuth().currentUser?.uid !== accountUid) return;
      onChange(result.consent);
      setMessage(allowed ? "AI sharing is on. You can now use AI features." : "AI sharing is off. Manual tracking is still available.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your choice. Sharing has not been enabled.");
    } finally { setBusy(false); }
  }

  return <section aria-label="AI data sharing" className="rounded-xl border border-calm/40 bg-surface p-5 text-white">
    <h2 className="text-xl font-semibold">Your choice about AI</h2>
    <p className="mt-3 text-sm leading-6 text-zinc-300">Ascend uses {consent.providerName ?? "an AI service"} to estimate meals, interpret workout or scan information, and personalize Zoe’s guidance, including daily suggestions and progress reflections.</p>
    <p className="mt-3 font-semibold">If you allow it, Ascend sends relevant data to {consent.providerName ?? "the AI provider"}:</p>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">{(iosFree ? iosAiDataCategories : AI_DATA_CATEGORIES).map(item => <li key={item}>{item}</li>)}</ul>
    <p className="mt-3 text-sm leading-6 text-zinc-300">This permission also covers AI guidance your assigned trainer requests using your records. Ascend does not send your password or payment card details to the AI provider. Avoid including unnecessary personal details in images or messages.</p>
    <p className="mt-3 text-sm leading-6 text-zinc-300">AI sharing is optional. You can decline and continue manual tracking, or turn it off later under Profile → AI privacy. Turning it off stops new AI requests; it cannot undo data already sent. AI estimates can be inaccurate.</p>
    <Link href={iosFree ? "/privacy/ios" : "/privacy"} className="mt-3 inline-flex min-h-11 items-center text-calm underline">Read the Privacy Policy</Link>
    <p className="my-3 text-sm font-semibold">AI sharing: {consent.allowed ? "On" : "Off"}</p>
    {consent.provider ? <div className="grid gap-3 sm:grid-cols-2">
      {!consent.allowed && <button type="button" disabled={busy} onClick={() => choose(true)} className="min-h-12 rounded-lg bg-calm px-4 py-3 font-semibold text-ink disabled:opacity-50">Allow sharing with {consent.providerName}</button>}
      <button type="button" disabled={busy} onClick={() => choose(false)} className="min-h-12 rounded-lg border border-line px-4 py-3 font-semibold disabled:opacity-50">{consent.allowed ? "Turn off AI sharing" : "Continue without AI"}</button>
    </div> : <p>AI features are not available in this environment.</p>}
    {message && <p role="status" className="mt-3 text-sm leading-6">{message}</p>}
  </section>;
}
