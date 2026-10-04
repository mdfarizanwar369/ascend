"use client";

import { useEffect, useState } from "react";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { getNativeCapacitorPlatform } from "@/lib/nativePlatform";
import { API_URL } from "@/lib/api";
import { ascendSiri, type AscendSiriStatus } from "@/lib/ascendSiri";

export function AscendSiriSetup() {
  const [status, setStatus] = useState<AscendSiriStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getNativeCapacitorPlatform() !== "ios") return;
    let active = true;
    void ascendSiri.status().then(result => { if (active) setStatus(result); })
      .catch(() => { if (active) setError("Update Ascend from TestFlight to enable Siri."); });
    return () => { active = false; };
  }, []);

  if (getNativeCapacitorPlatform() !== "ios") return null;

  async function connect() {
    const user = getFirebaseClientAuth().currentUser;
    if (!user) { setError("Sign in again before connecting Siri."); return; }
    setBusy(true); setError("");
    try {
      const result = await ascendSiri.connect({ apiBaseUrl: API_URL, firebaseToken: await user.getIdToken(), firebaseUid: user.uid });
      setStatus({ supported: true, connected: result.connected, firebaseUid: user.uid, expiresAt: result.expiresAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Siri. Please try again.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError("");
    try {
      await ascendSiri.disconnect();
      setStatus({ supported: true, connected: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Siri. Please try again.");
    } finally { setBusy(false); }
  }

  const connected = status?.connected && status.firebaseUid === getFirebaseClientAuth().currentUser?.uid;
  return <section className="ascend-inset my-3 p-4" aria-label="Siri with Ascend">
    <h2 className="text-sm font-semibold text-white">Siri with Ascend <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">Owner test</span></h2>
    <p className="mt-1 text-xs leading-5 text-zinc-400">Ask Siri about food, water, macros, workouts, weight, goals, and more from your Ascend records. Your iPhone must be unlocked to hear private answers.</p>
    {connected ? <>
      <p className="mt-2 text-xs text-calm" role="status">Connected on this iPhone.</p>
      <p className="mt-2 text-xs text-zinc-300">Say “Hey Siri, ask Ascend a question,” then ask in your own words about your Ascend records. For a direct answer, try “Hey Siri, ask Ascend how much water I drank” or “Hey Siri, ask Ascend how many calories I have left.” Include “Ascend” so Siri knows which app to ask.</p>
      <button type="button" onClick={() => void disconnect()} disabled={busy} className="mt-3 min-h-10 rounded-full border border-white/15 px-4 text-xs text-zinc-200 disabled:opacity-50">Disconnect Siri</button>
    </> : <>
      <button type="button" onClick={() => void connect()} disabled={busy || status?.supported === false} className="mt-3 min-h-10 rounded-full bg-calm px-4 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Connecting…" : "Enable Siri"}</button>
      {status?.supported === false && <p className="mt-2 text-xs text-amber-300">Siri shortcuts need iOS 16 or newer.</p>}
    </>}
    {error && <p className="mt-2 text-xs text-amber-300" role="alert">{error}</p>}
  </section>;
}
