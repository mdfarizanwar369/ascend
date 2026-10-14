"use client";
import Link from "next/link";
import { Bell, ChevronLeft, ChevronRight, Moon, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { isRoutineNudge, nudgeCategories, nudgeLabels, nudgeTemplates, NudgeCategory, NudgePreferences, validTimezone } from "@ascend/shared";
import { getSmartNudgePreferences, saveSmartNudgePreferences, SmartNudgeSettingsResponse } from "@/lib/ascendApi";
import { coachNotificationPermission, enableCoachNotifications, NotificationPermissionState } from "@/lib/coachNotifications";
import { inputClass, selectClass } from "@/components/Field";

const descriptions: Record<NudgeCategory, string> = {
  breakfast: "Stay quiet if breakfast is already recorded.", lunch: "A quick invitation to log, with no assumptions about eating.",
  dinner: "Stay quiet if dinner is already recorded.", workout: "Only sessions you put in your workout schedule.", hydration: "Stay quiet after a recent water log.",
  morning: "Make a little space to plan your day.", evening: "Review what you recorded today.", weekly: "Open your real progress in Journey.",
  comeback: "After time away from the app. At most three reminders, a week apart.", milestone: "Celebrate your first, tenth and twenty-fifth recorded workouts."
};
export function NudgeSettingsClient() {
  const [data, setData] = useState<SmartNudgeSettingsResponse | null>(null);
  const [prefs, setPrefs] = useState<NudgePreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>("unavailable");
  const [status, setStatus] = useState("Loading your preferences…");
  const [busy, setBusy] = useState(false);
  const [deviceZone, setDeviceZone] = useState("");
  async function load() {
    setStatus("Loading your preferences…");
    try {
      const result = await getSmartNudgePreferences();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setDeviceZone(zone); setData(result); setPrefs(result.version ? result.preferences : { ...result.preferences, timezone: zone });
      setPermission(await coachNotificationPermission()); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not load reminder settings."); }
  }
  useEffect(() => { void load(); }, []);
  const change = <K extends keyof NudgePreferences>(key: K, value: NudgePreferences[K]) => setPrefs(p => p ? { ...p, [key]: value } : p);
  function categoryChange(category: NudgeCategory, value: Partial<NudgePreferences["categories"][NudgeCategory]>) {
    setPrefs(p => p ? { ...p, categories: { ...p.categories, [category]: { ...p.categories[category], ...value } } } : p);
  }
  async function save() {
    if (!prefs || !data) return;
    setBusy(true); setStatus("Saving your choices…");
    try { const result = await saveSmartNudgePreferences(prefs, data.version); setData({ ...data, ...result }); setPrefs(result.preferences); setStatus(prefs.enabled ? "Preferences saved. Reminders apply to your enabled devices." : "Zoe nudges are off. Pending reminders will stay quiet."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not save. Your previous choices are still in place."); }
    finally { setBusy(false); }
  }
  async function enableDevice() {
    setBusy(true);
    try { await enableCoachNotifications(); setPermission(await coachNotificationPermission()); setStatus("This device is ready. Save your preferences to choose when Zoe can nudge you."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not enable this device."); setPermission(await coachNotificationPermission().catch(() => "unavailable" as const)); }
    finally { setBusy(false); }
  }
  return <main className="ascend-page min-h-screen px-4 pb-32 pt-6 text-white"><div className="mx-auto max-w-md">
    <Link href="/profile" className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400"><ChevronLeft size={17} /> Profile</Link>
    <header className="relative mt-3 overflow-hidden rounded-3xl border border-lime/20 bg-gradient-to-br from-lime/10 via-surface to-surface p-6">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-lime"><Sparkles size={16} /> Zoe · at your pace</div>
      <h1 className="text-3xl font-semibold tracking-tight">A little nudge.<br />On your terms.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">Choose what helps. Zoe stays quiet when you have already recorded it.</p>
      {prefs && <label className="mt-6 flex min-h-14 cursor-pointer items-center justify-between gap-4 border-t border-white/10 pt-4">
        <span><span className="block font-semibold">Zoe smart nudges</span><span className="text-xs text-zinc-400">{prefs.enabled ? "Your chosen reminders" : "All Zoe nudges are off"}</span></span>
        <input type="checkbox" role="switch" aria-label="Zoe smart nudges" checked={prefs.enabled} disabled={busy || (!data?.available && !prefs.enabled)} onChange={e => change("enabled", e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-calm ${prefs.enabled ? "bg-lime" : "bg-white/10"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-transform ${prefs.enabled ? "translate-x-6" : "translate-x-1"}`} /></span>
      </label>}
    </header>
    <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-calm">{status}</p>
    {!prefs || !data ? <button onClick={() => void load()} className="mt-3 min-h-11 text-sm text-lime">Reload preferences</button> : <>
      {!data.available && <p className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm leading-6 text-zinc-400">Smart nudges are not active for this account yet. Saved choices are preserved, and you can still turn them off.</p>}
      {prefs.enabled && !nudgeCategories.some(c => prefs.categories[c].enabled && !(prefs.intensity === "minimal" && isRoutineNudge(c))) && <p className="mt-3 text-sm leading-6 text-zinc-300">Choose one or more categories below. Nothing is scheduled yet.</p>}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 font-semibold"><Bell size={17} className="text-lime" /> This device</div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{permission === "granted" ? "Notifications are allowed. Connect this device to receive your saved choices." : permission === "denied" ? "Notifications are blocked. Enable Ascend notifications in device or browser Settings, then return here." : permission === "unavailable" ? "Push is unavailable in this app build or browser. Your preferences can still be saved for a supported device." : "We will ask for device permission only when you choose to enable it."}</p>
        {data.available && permission !== "unavailable" && permission !== "denied" && <button onClick={() => void enableDevice()} disabled={busy} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-lime/30 text-sm font-semibold text-lime disabled:opacity-50">{permission === "granted" ? "Connect this device" : "Enable this device"}</button>}
      </section>
      <fieldset disabled={busy || !data.available} className="mt-5 min-w-0 space-y-5 disabled:opacity-60">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal size={17} className="text-lime" /> Your rhythm</h2>
          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Reminder intensity">{(["minimal", "balanced", "supportive"] as const).map(mode => <button type="button" key={mode} aria-pressed={prefs.intensity === mode} onClick={() => change("intensity", mode)} className={`min-h-12 rounded-xl border px-1 text-xs font-semibold capitalize ${prefs.intensity === mode ? "border-lime/50 bg-lime/10 text-lime" : "border-line text-zinc-400"}`}>{mode}</button>)}</div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">{prefs.intensity === "minimal" ? "Only the meal, water and workout reminders you choose." : `Up to ${prefs.intensity === "balanced" ? "two" : "three"} routine coaching nudges a day, when useful.`} Never more than four nudges in a day or 24 hours, with at least 90 minutes between them.</p>
        </section>
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 className="px-4 pb-2 pt-4 font-semibold">What would help?</h2>
          {nudgeCategories.filter(c => data.categories.includes(c)).map(c => <details key={c} className="group border-t border-line px-4">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3"><span className="text-sm font-medium">{nudgeLabels[c]}</span><span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">{prefs.categories[c].enabled && !(isRoutineNudge(c) && prefs.intensity === "minimal") ? c === "workout" ? "Scheduled" : prefs.categories[c].time : "Off"}<ChevronRight size={15} className="group-open:rotate-90" /></span></summary>
            <div className="pb-4"><p className="text-xs leading-5 text-zinc-400">{descriptions[c]}</p>
              {isRoutineNudge(c) && prefs.intensity === "minimal" ? <p className="mt-3 text-xs text-calm">Choose Balanced or Supportive to use this category.</p> : <>
                <label className="mt-3 flex min-h-11 items-center justify-between gap-4 text-sm">Allow {nudgeLabels[c].toLowerCase()}<input type="checkbox" role="switch" aria-label={nudgeLabels[c]} checked={prefs.categories[c].enabled} onChange={e => categoryChange(c, { enabled: e.target.checked })} className="peer sr-only" /><span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-calm ${prefs.categories[c].enabled ? "bg-lime" : "bg-white/10"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-transform ${prefs.categories[c].enabled ? "translate-x-6" : "translate-x-1"}`} /></span></label>
                {c !== "workout" && <label className="mt-2 block text-xs text-zinc-400">Preferred time<input type="time" aria-label={`${nudgeLabels[c]} time`} value={prefs.categories[c].time} onChange={e => categoryChange(c, { time: e.target.value })} className={`${inputClass} mt-2 w-full min-w-0`} /></label>}
                {c === "weekly" && <label className="mt-3 block text-xs text-zinc-400">Review day<select aria-label="Review day" value={prefs.weeklyDay} onChange={e => change("weeklyDay", Number(e.target.value))} className={`${selectClass} mt-2 w-full`}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>}
                {c === "comeback" && <label className="mt-3 block text-xs text-zinc-400">First reminder after<select aria-label="Days away before a reminder" value={prefs.comebackDays} onChange={e => change("comebackDays", Number(e.target.value) as 3 | 7 | 14)} className={`${selectClass} mt-2 w-full`}>{[3, 7, 14].map(days => <option key={days} value={days}>{days} days away from the app</option>)}</select></label>}
              </>}
              {c === "workout" && <Link href="/workout-schedule" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-lime">Open workout schedule <ChevronRight size={16} /></Link>}
              <div className="mt-3 rounded-xl bg-ink p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Preview</p><p className="mt-1 text-xs leading-5 text-zinc-300">{nudgeTemplates[c].body}</p></div>
            </div>
          </details>)}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Moon size={17} className="text-calm" /> Space to switch off</h2>
          <div className="mt-4 grid grid-cols-2 gap-3"><label className="min-w-0 text-xs text-zinc-400">Quiet from<input type="time" aria-label="Quiet hours start" className={`${inputClass} mt-2 w-full min-w-0`} value={prefs.quietStart} onChange={e => change("quietStart", e.target.value)} /></label><label className="min-w-0 text-xs text-zinc-400">Until<input type="time" aria-label="Quiet hours end" className={`${inputClass} mt-2 w-full min-w-0`} value={prefs.quietEnd} onChange={e => change("quietEnd", e.target.value)} /></label></div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">Reminders during quiet hours are skipped. Matching start and end times mean quiet all day.</p>
          <label className="mt-4 block text-xs text-zinc-400">Time zone<input aria-label="Time zone" autoCapitalize="none" spellCheck={false} value={prefs.timezone} onChange={e => change("timezone", e.target.value)} className={`${inputClass} mt-2 w-full`} /></label>
          {deviceZone && deviceZone !== prefs.timezone && <button type="button" onClick={() => change("timezone", deviceZone)} className="mt-2 min-h-11 text-left text-xs text-lime">Use this device’s zone: {deviceZone}</button>}
          <p className="mt-2 text-xs leading-5 text-zinc-500">Saved across your devices. Change this when you travel; times will follow your chosen zone.</p>
        </section>
      </fieldset>
      <p className="mt-5 text-xs leading-5 text-zinc-500">These controls apply to Zoe nudges. Direct trainer updates and essential account messages are separate. Lock-screen reminders contain no health measurements. A notification already handed to a provider may still arrive after you turn nudges off.</p>
      <div className="sticky bottom-4 mt-5 rounded-2xl bg-ink/95 p-2 backdrop-blur"><button onClick={() => void save()} disabled={busy || !validTimezone(prefs.timezone) || (!data.available && prefs.enabled)} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:opacity-50">{busy ? "Please wait…" : "Save preferences"}</button></div>
      <button type="button" onClick={() => void load()} disabled={busy} className="mt-1 min-h-11 w-full text-xs text-zinc-400">Reload saved choices</button>
    </>}
  </div></main>;
}
