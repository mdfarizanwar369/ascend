"use client";

import { useEffect,useState } from "react";
import type { HealthActivityStatus } from "@ascend/shared";
import { BackButton } from "@/components/BackButton";
import { AppleHealth,connectAppleHealth,disconnectAppleHealth,runAppleHealthSync,type AppleHealthNativeStatus } from "@/lib/appleHealth";
import { getHealthActivityStatus,saveHealthManualAdjustment } from "@/lib/ascendApi";

export function AppleHealthClient() {
  const [server,setServer] = useState<HealthActivityStatus | null>(null);
  const [native,setNative] = useState<AppleHealthNativeStatus | null>(null);
  const [message,setMessage] = useState("Loading Apple Health…");
  const [working,setWorking] = useState(false);
  const [uploadConsent,setUploadConsent] = useState(false);
  const [selectDevice,setSelectDevice] = useState(false);
  const [deleteConfirm,setDeleteConfirm] = useState(false);
  const [adjustments,setAdjustments] = useState<Record<string,string>>({});

  async function refresh() {
    const [backend,device] = await Promise.all([getHealthActivityStatus(),AppleHealth.status()]);
    setServer(backend.status); setNative(device);
  }
  useEffect(() => { void refresh().then(() => setMessage("")).catch(() => setMessage("Could not load Apple Health. Please try again.")); },[]);
  async function act(action: () => Promise<unknown>,success: string) {
    setWorking(true); setMessage("");
    try { await action(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Apple Health could not sync."); }
    finally { setWorking(false); }
  }
  const current = server?.connections.find(connection => connection.installationId === native?.installationId);
  const connected = current?.connected && native?.connected;
  const selectedElsewhere = server?.connections.some(connection => connection.selected && connection.installationId !== native?.installationId);
  const summary = server?.summary;
  const format = (date: string | null | undefined) => date ? new Date(date).toLocaleString() : "Not yet synced";

  return <main className="min-h-screen bg-ink px-4 py-5 text-white"><div className="mx-auto max-w-md">
    <header className="flex items-center gap-3 py-3"><BackButton fallbackHref="/profile" /><h1 className="text-2xl font-semibold">Apple Health</h1></header>
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm leading-6 text-zinc-300">Bring your steps, active calories and workouts into Ascend. Choose what to share in Apple's permission screen. Your food target will not change.</p>
      <p className="mt-3 text-sm text-zinc-400">Read-only: Ascend does not change Apple Health or request heart rate, sleep, location, nutrition or medical records.</p>
      <p className="mt-4 font-semibold">{connected ? current?.selected ? "Connected on this device" : "Connected · another device supplies the daily total" : "Not connected"}</p>
      <p className="mt-2 text-xs text-zinc-400">Last device read: {format(native?.lastReadAt)}</p>
      <p className="mt-1 text-xs text-zinc-400">Last account upload: {format(current?.lastUploadedAt)}</p>
      {(native?.pendingCount ?? 0) > 0 && <p className="mt-2 text-sm text-amber">Updates are waiting to upload. Open Ascend with an internet connection to sync.</p>}
      {!connected && <>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={uploadConsent} onChange={event => setUploadConsent(event.target.checked)} className="mt-1" />I agree to store these imported records in my Ascend account for my dashboard and reports. This does not authorize sharing them with AI, trainers or advertising services.</label>
        {selectedElsewhere && <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={selectDevice} onChange={event => setSelectDevice(event.target.checked)} />Use this device instead of my existing daily activity source. Provider totals will not be added together.</label>}
        <button type="button" disabled={working || !uploadConsent || !server?.enabled || !native?.available} onClick={() => void act(() => connectAppleHealth(selectDevice),"Connection saved. Available records are synced; missing categories may have no readable data.")} className="mt-5 min-h-12 w-full rounded-xl bg-lime px-3 font-semibold text-ink disabled:opacity-50">Connect Apple Health</button>
      </>}
      {connected && <button type="button" disabled={working} onClick={() => void act(() => runAppleHealthSync(true),"Available Health records refreshed.")} className="mt-5 min-h-12 w-full rounded-xl bg-lime font-semibold text-ink disabled:opacity-50">{working ? "Syncing…" : "Sync now"}</button>}
      {!server?.enabled && server !== null && <p className="mt-3 text-sm text-amber">Apple Health is not enabled for this account yet.</p>}
    </section>
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5"><h2 className="font-semibold">Today's activity</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><p className="text-xs text-zinc-400">Steps</p><p className="mt-1 text-xl font-semibold">{summary?.steps?.toLocaleString() ?? "No readable data"}</p></div>
        <div><p className="text-xs text-zinc-400">{summary?.energyBasis === "mixed_estimate" ? "Estimated activity kcal" : "Active kcal"}</p><p className="mt-1 text-xl font-semibold">{summary?.displayedCalories === null || summary?.displayedCalories === undefined ? "No readable data" : Math.round(summary.displayedCalories).toLocaleString()}</p></div>
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-400">{summary?.coverage === "workouts_only" ? "Partial coverage: calories from recorded workouts, not your entire day." : summary?.coverage === "stale_provider_daily" ? "The last recorded energy is retained. Refresh or review your Health access." : "Apple Health daily energy already includes recorded workouts and movement. Steps and workout calories are not added twice."}</p>
      <p className="mt-2 text-xs text-zinc-400">No readable data can mean no records or restricted access. Ascend cannot determine which read switches you declined.</p>
      {summary?.excludedManual.map(entry => <div key={entry.id} className="mt-4 rounded-xl border border-line p-3">
        <p className="text-sm font-semibold">{entry.label}</p><p className="mt-1 text-xs text-zinc-400">{entry.reason === "already_included" ? "Already included in Apple Health." : "Not added separately to avoid double counting."}</p>
        {entry.reason !== "already_included" && <>
          <label className="mt-3 block text-xs text-zinc-400">Estimated active kcal only if this activity was not recorded in Apple Health<input type="number" min="0" max="100000" value={adjustments[entry.id] ?? ""} onChange={event => setAdjustments(values => ({ ...values,[entry.id]:event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
          <button type="button" disabled={working || adjustments[entry.id] === undefined || adjustments[entry.id] === "" || !Number.isFinite(Number(adjustments[entry.id])) || Number(adjustments[entry.id]) < 0} onClick={() => void act(() => saveHealthManualAdjustment(entry.id,Number(adjustments[entry.id]),true),"Untracked estimate added. If a device recorded it, remove this adjustment to avoid overstating energy.")} className="mt-3 min-h-11 rounded-lg border border-line px-3 text-sm">Confirm this activity was untracked</button>
        </>}
      </div>)}
      {(summary?.manualActiveCalories ?? 0) > 0 && <p className="mt-3 text-sm text-zinc-300">Includes {Math.round(summary!.manualActiveCalories)} estimated kcal from eligible manual activity.</p>}
    </section>
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5"><h2 className="font-semibold">Privacy and connection</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-400">This release does not send Apple Health imports to AI or trainer views. Background updates may wait until you open Ascend to upload. You can review Ascend's access in Apple's Health settings.</p>
      <p className="mt-2 text-xs text-zinc-400">Disconnect stops future sync but keeps imported history. Deleting imported history preserves your manual logs and does not delete anything from Apple Health.</p>
      <button type="button" disabled={working || !current?.connected} onClick={() => void act(() => disconnectAppleHealth(),"Disconnected. Imported history is retained.")} className="mt-4 min-h-11 w-full rounded-xl border border-amber/40 text-amber disabled:opacity-50">Disconnect</button>
      <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" checked={deleteConfirm} onChange={event => setDeleteConfirm(event.target.checked)} />Delete this device's imported history from Ascend and stop syncing. Manual logs remain.</label>
      <button type="button" disabled={working || !deleteConfirm || !current} onClick={() => void act(() => disconnectAppleHealth(true),"Imported history deleted from Ascend. Apple Health and manual logs are unchanged.")} className="mt-3 min-h-11 w-full rounded-xl border border-rose-400/40 text-rose-300 disabled:opacity-50">Delete imported history</button>
    </section>
    {message && <p role="status" className="mt-4 rounded-xl border border-line p-4 text-sm text-zinc-300">{message}</p>}
  </div></main>;
}
