"use client";
import Link from "next/link";
import { Bell, Check, ChevronLeft, ChevronRight, Dumbbell, Moon, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { isRoutineNudge, nudgeCategories, nudgeLabels, nudgeTemplates, NudgeCategory, NudgePreferences, validTimezone } from "@ascend/shared";
import { getSmartNudgePreferences, saveSmartNudgePreferences, SmartNudgeSettingsResponse } from "@/lib/ascendApi";
import { coachNotificationPermission, enableCoachNotifications, NotificationPermissionState } from "@/lib/coachNotifications";
import { applyNudgePreset, NudgePreset, presetAvailable, selectedNudgePreset, suggestedNudgePreferences } from "@/lib/nudgePresets";
import { inputClass, selectClass } from "@/components/Field";

const descriptions: Record<NudgeCategory, string> = {
  breakfast: "Stay quiet if breakfast is already recorded.", lunch: "A quick invitation to log, with no assumptions about eating.",
  dinner: "Stay quiet if dinner is already recorded.", workout: "Only sessions you put in your workout schedule.", hydration: "Stay quiet after a recent water log.",
  morning: "Make a little space to plan your day.", evening: "Review what you recorded today.", weekly: "Open your real progress in Journey.",
  comeback: "After time away from the app. At most three reminders, a week apart.", milestone: "Celebrate your first, tenth and twenty-fifth recorded workouts."
};
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours >= 12 ? "pm" : "am"}`;
}
function SwitchTrack({ checked }: { checked: boolean }) {
  return <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-calm ${checked ? "bg-lime" : "bg-white/10"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span>;
}
export function NudgeSettingsClient() {
  const [data, setData] = useState<SmartNudgeSettingsResponse | null>(null);
  const [prefs, setPrefs] = useState<NudgePreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>("unavailable");
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [status, setStatus] = useState("Loading your preferences…");
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customising, setCustomising] = useState(false);
  const [deviceZone, setDeviceZone] = useState("");
  async function load() {
    setLoading(true); setStatus("Loading your preferences…");
    try {
      const result = await getSmartNudgePreferences();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setDeviceZone(zone); setData(result);
      setPrefs(result.version ? result.preferences : suggestedNudgePreferences(zone, result.categories));
      setPermission(await coachNotificationPermission().catch(() => "unavailable" as const)); setStatus(""); setSaveFailed(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not load reminder settings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const change = <K extends keyof NudgePreferences>(key: K, value: NudgePreferences[K]) => setPrefs(p => p ? { ...p, [key]: value } : p);
  function categoryChange(category: NudgeCategory, value: Partial<NudgePreferences["categories"][NudgeCategory]>) {
    setPrefs(p => p ? { ...p, categories: { ...p.categories, [category]: { ...p.categories[category], ...value } } } : p);
  }
  function choosePreset(preset: NudgePreset) {
    if (!prefs || !data || !presetAvailable(preset, data.categories)) return;
    setPrefs(applyNudgePreset(prefs, preset));
    setStatus("");
  }
  const preset = prefs ? selectedNudgePreset(prefs) : null;
  const firstSetup = data?.version === 0;
  const activeCategories = prefs && data ? data.categories.filter(c => prefs.categories[c].enabled && !(prefs.intensity === "minimal" && isRoutineNudge(c))) : [];
  async function save() {
    if (!prefs || !data || busy || loading) return;
    const next = { ...prefs, enabled: firstSetup ? true : prefs.enabled };
    setBusy(true); setSaveFailed(false); setStatus("Saving your choices…");
    let deviceNote = "";
    try {
      // Only this explicit action asks permission or connects a device.
      if (next.enabled && !deviceConnected && (permission === "prompt" || permission === "granted")) {
        try {
          await enableCoachNotifications(); setPermission("granted"); setDeviceConnected(true);
        } catch (error) {
          deviceNote = error instanceof Error ? error.message : "This device could not connect. Try saving again to reconnect.";
          setPermission(await coachNotificationPermission().catch(() => "unavailable" as const));
        }
      } else if (next.enabled && permission === "denied") {
        deviceNote = "Notifications are blocked on this device. Enable Ascend notifications in device Settings.";
      } else if (next.enabled && permission === "unavailable") {
        deviceNote = "This device does not support push here. Your choices apply to your other enabled devices.";
      }
      const result = await saveSmartNudgePreferences(next, data.version);
      setData({ ...data, ...result }); setPrefs(result.preferences);
      setStatus(result.preferences.enabled ? `Preferences saved. ${deviceNote || "This device is connected for your chosen reminders."}` : "Zoe nudges are off. Pending reminders will stay quiet.");
    } catch (error) { setSaveFailed(true); setStatus(error instanceof Error ? error.message : "Could not save. Your previous choices are still in place."); }
    finally { setBusy(false); }
  }
  const actionLabel = firstSetup ? preset === "daily" ? "Use recommended setup" : preset === "essentials" ? "Use essentials" : "Enable my reminders" : "Save preferences";
  const disabled = busy || loading || !prefs || !data || !validTimezone(prefs.timezone) || (!data.available && (firstSetup || prefs.enabled)) || ((firstSetup || prefs.enabled) && activeCategories.length === 0);
  return <main className="ascend-page min-h-screen px-4 pb-12 pt-5 text-white"><div className="mx-auto min-w-0 max-w-md">
    <Link href="/profile" className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400"><ChevronLeft size={17} /> Profile</Link>
    <header className="mb-5 mt-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-lime"><Sparkles size={15} /> Zoe · at your pace</div>
      <h1 className="text-3xl font-semibold tracking-tight">A little nudge.<br />Already planned.</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Choose a setup. Make it yours whenever you like.</p>
    </header>
    {!prefs || !data ? <button disabled={loading} onClick={() => void load()} className="min-h-11 text-sm text-lime disabled:opacity-50">{loading ? "Loading your setup…" : "Reload preferences"}</button> : <>
      {!firstSetup && <label className="mb-4 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3">
        <span><span className="block text-sm font-semibold">Zoe smart nudges</span><span className="text-xs text-zinc-400">{prefs.enabled ? "On · your chosen reminders" : "Off · your setup is kept"}</span></span>
        <input type="checkbox" role="switch" aria-label="Zoe smart nudges" checked={prefs.enabled} disabled={busy || loading || (!data.available && !prefs.enabled)} onChange={e => change("enabled", e.target.checked)} className="peer sr-only" />
        <SwitchTrack checked={prefs.enabled} />
      </label>}
      {!data.available && <p className="mb-4 rounded-2xl border border-line bg-surface p-4 text-sm leading-6 text-zinc-400">Smart nudges are not active for this account yet. Saved choices are preserved, and you can still turn them off.</p>}
      <fieldset disabled={busy || loading || !data.available} className="min-w-0 disabled:opacity-60">
        <legend className="sr-only">Choose your reminder setup</legend>
        <div className="space-y-3" role="group" aria-label="Reminder presets">
          <button type="button" aria-pressed={preset === "daily"} aria-label="Daily coaching, recommended" disabled={!presetAvailable("daily", data.categories)} onClick={() => choosePreset("daily")} className={`w-full rounded-3xl border bg-gradient-to-br from-lime/10 via-surface to-surface p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-50 ${preset === "daily" ? "border-lime/50" : "border-line"}`}>
            <span className="flex items-center justify-between gap-3"><span className="rounded-full bg-lime/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-lime">Recommended</span><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${preset === "daily" ? "border-lime bg-lime text-ink" : "border-white/20"}`}>{preset === "daily" && <Check size={15} />}</span></span>
            <span className="mt-3 block text-xl font-semibold">Daily coaching</span>
            <span className="mt-1 block text-sm text-zinc-400">A little structure, ready to go.</span>
            <span className="mt-4 grid gap-2.5 text-xs leading-5 text-zinc-300">
              <span className="flex items-center gap-2.5"><Dumbbell size={15} className="shrink-0 text-lime" /> Your scheduled workouts</span>
              <span className="flex items-center gap-2.5"><Moon size={15} className="shrink-0 text-lime" /> Evening check-in · {timeLabel(prefs.categories.evening.time)}</span>
              <span className="flex items-center gap-2.5"><TrendingUp size={15} className="shrink-0 text-lime" /> Weekly review · {days[prefs.weeklyDay]} {timeLabel(prefs.categories.weekly.time)}</span>
            </span>
            {!presetAvailable("daily", data.categories) && <span className="mt-3 block text-xs text-zinc-400">Not available for this account yet</span>}
          </button>
          <button type="button" aria-pressed={preset === "essentials"} aria-label="Essentials" disabled={!presetAvailable("essentials", data.categories)} onClick={() => choosePreset("essentials")} className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-50 ${preset === "essentials" ? "border-lime/50 bg-lime/5" : "border-line"}`}>
            <span><span className="block text-sm font-semibold">Essentials</span><span className="mt-1 block text-xs leading-5 text-zinc-400">Scheduled workouts + your weekly review.</span>{!presetAvailable("essentials", data.categories) && <span className="mt-1 block text-xs text-zinc-400">Not available yet</span>}</span>
            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${preset === "essentials" ? "border-lime bg-lime text-ink" : "border-white/20"}`}>{preset === "essentials" && <Check size={15} />}</span>
          </button>
        </div>
        {!preset && <p className="mt-3 text-xs leading-5 text-lime">Custom setup · only the reminders you choose.</p>}
        <div className="my-4 flex items-start gap-2 px-1 text-xs leading-5 text-zinc-400"><Moon size={14} className="mt-0.5 shrink-0 text-calm" /><p>{prefs.quietStart === prefs.quietEnd ? "Quiet all day · reminders will not be sent" : `Quiet ${timeLabel(prefs.quietStart)}–${timeLabel(prefs.quietEnd)}`}<span className="block break-words text-[11px] text-zinc-500">{prefs.timezone.replaceAll("_", " ")}</span></p></div>
        <button type="button" aria-expanded={customising} aria-controls="nudge-customise" onClick={() => setCustomising(value => !value)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime">
          <span className="flex items-center gap-3"><SlidersHorizontal size={17} className="shrink-0 text-zinc-400" /><span><span className="block text-sm font-semibold">Customise</span><span className="text-xs text-zinc-400">Reminders, times & quiet hours</span></span></span><ChevronRight size={16} className={`shrink-0 text-zinc-500 transition-transform ${customising ? "rotate-90" : ""}`} />
        </button>
        {customising && <div id="nudge-customise" className="mt-3 min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <h2 className="px-4 pb-3 pt-4 text-sm font-semibold">Your reminders</h2>
            {nudgeCategories.filter(c => data.categories.includes(c)).map(c => <details key={c} className="group border-t border-line px-4">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3"><span className="text-sm font-medium">{nudgeLabels[c]}</span><span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">{prefs.categories[c].enabled && !(isRoutineNudge(c) && prefs.intensity === "minimal") ? c === "workout" ? "Scheduled" : timeLabel(prefs.categories[c].time) : "Off"}<ChevronRight size={15} className="group-open:rotate-90" /></span></summary>
              <div className="pb-4"><p className="text-xs leading-5 text-zinc-400">{descriptions[c]}</p>
                {isRoutineNudge(c) && prefs.intensity === "minimal" ? <p className="mt-3 text-xs text-calm">Choose Balanced or Supportive under Coaching frequency to use this category.</p> : <>
                  <label className="mt-3 flex min-h-11 items-center justify-between gap-4 text-sm">Allow {nudgeLabels[c].toLowerCase()}<input type="checkbox" role="switch" aria-label={nudgeLabels[c]} checked={prefs.categories[c].enabled} onChange={e => categoryChange(c, { enabled: e.target.checked })} className="peer sr-only" /><SwitchTrack checked={prefs.categories[c].enabled} /></label>
                  {c !== "workout" && <label className="mt-2 block text-xs text-zinc-400">Preferred time<input type="time" aria-label={`${nudgeLabels[c]} time`} value={prefs.categories[c].time} onChange={e => categoryChange(c, { time: e.target.value })} className={`${inputClass} mt-2 w-full min-w-0`} /></label>}
                  {c === "weekly" && <label className="mt-3 block text-xs text-zinc-400">Review day<select aria-label="Review day" value={prefs.weeklyDay} onChange={e => change("weeklyDay", Number(e.target.value))} className={`${selectClass} mt-2 w-full`}>{days.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>}
                  {c === "comeback" && <label className="mt-3 block text-xs text-zinc-400">First reminder after<select aria-label="Days away before a reminder" value={prefs.comebackDays} onChange={e => change("comebackDays", Number(e.target.value) as 3 | 7 | 14)} className={`${selectClass} mt-2 w-full`}>{[3, 7, 14].map(value => <option key={value} value={value}>{value} days away from the app</option>)}</select></label>}
                </>}
                {c === "workout" && <Link href="/workout-schedule" className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-lime">Open workout schedule <ChevronRight size={16} /></Link>}
                <div className="mt-3 rounded-xl bg-ink p-3"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Preview</p><p className="mt-1 text-xs leading-5 text-zinc-300">{nudgeTemplates[c].body}</p></div>
              </div>
            </details>)}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Moon size={17} className="text-calm" /> Quiet hours & time zone</h2>
            <div className="mt-4 grid grid-cols-2 gap-3"><label className="min-w-0 text-xs text-zinc-400">Quiet from<input type="time" aria-label="Quiet hours start" className={`${inputClass} mt-2 w-full min-w-0`} value={prefs.quietStart} onChange={e => change("quietStart", e.target.value)} /></label><label className="min-w-0 text-xs text-zinc-400">Until<input type="time" aria-label="Quiet hours end" className={`${inputClass} mt-2 w-full min-w-0`} value={prefs.quietEnd} onChange={e => change("quietEnd", e.target.value)} /></label></div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">Reminders during quiet hours are skipped. Matching times mean quiet all day.</p>
            <label className="mt-4 block text-xs text-zinc-400">Time zone<input aria-label="Time zone" autoCapitalize="none" spellCheck={false} value={prefs.timezone} onChange={e => change("timezone", e.target.value)} className={`${inputClass} mt-2 w-full`} /></label>
            {!validTimezone(prefs.timezone) && <p className="mt-2 text-xs text-amber">Enter a valid time zone, such as Asia/Singapore, to save.</p>}
            {deviceZone && deviceZone !== prefs.timezone && <button type="button" onClick={() => change("timezone", deviceZone)} className="mt-2 min-h-11 text-left text-xs text-lime">Use this device’s zone: {deviceZone}</button>}
            <p className="mt-2 text-xs leading-5 text-zinc-500">Times follow this zone across your devices. Update it when you travel.</p>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Coaching frequency</h2>
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Reminder intensity">{(["minimal", "balanced", "supportive"] as const).map(mode => <button type="button" key={mode} aria-pressed={prefs.intensity === mode} onClick={() => change("intensity", mode)} className={`min-h-12 rounded-xl border px-1 text-xs font-semibold capitalize ${prefs.intensity === mode ? "border-lime/50 bg-lime/10 text-lime" : "border-line text-zinc-400"}`}>{mode}</button>)}</div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">{prefs.intensity === "minimal" ? "Only your chosen meal, water and workout reminders. Weekly reviews and other coaching nudges are paused." : `Up to ${prefs.intensity === "balanced" ? "two" : "three"} of your chosen coaching nudges a day, when useful.`} All reminders share a limit of four per day and per 24 hours, at least 90 minutes apart.</p>
            <p className="mt-3 text-xs leading-5 text-zinc-500">Lock-screen nudges contain no health measurements. A notification already sent may still arrive after you turn nudges off.</p>
          </section>
        </div>}
      </fieldset>
      {(firstSetup || prefs.enabled) && activeCategories.length === 0 && data.available && <p className="mt-3 text-sm leading-6 text-zinc-300">Choose a preset or enable a reminder in Customise to get started.</p>}
      <div className="mt-4 flex items-start gap-2 px-1 text-xs leading-5 text-zinc-400"><Bell size={14} className="mt-0.5 shrink-0 text-lime" /><p>{permission === "denied" ? "Notifications are blocked on this device. Enable Ascend notifications in device Settings. You can still save your choices." : permission === "unavailable" ? "Push is unavailable here. You can save this setup for your other enabled devices." : deviceConnected ? "This device is connected." : firstSetup ? "Enable your setup below. We’ll ask for notification permission if needed." : "Saving an enabled setup also connects this device."}</p></div>
      <div className="sticky bottom-4 z-10 mt-4 rounded-2xl bg-ink/95 p-2 backdrop-blur"><button onClick={() => void save()} disabled={disabled} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime px-3 text-sm font-semibold text-ink disabled:opacity-50">{busy ? "Saving your setup…" : <><Check size={16} />{actionLabel}</>}</button><p role="status" aria-live="polite" className={status ? "px-1 pb-1 pt-3 text-xs leading-5 text-calm" : ""}>{status}</p></div>
      <p className="mt-2 text-center text-[11px] leading-5 text-zinc-500">Trainer messages and account updates are separate.</p>
      {firstSetup && <Link href="/profile" className="mt-1 flex min-h-11 items-center justify-center text-xs text-zinc-400">Not now</Link>}
      {(!firstSetup || saveFailed) && <button type="button" onClick={() => void load()} disabled={busy || loading} className="mt-1 min-h-11 w-full text-xs text-zinc-400">Reload saved choices</button>}
    </>}
    {(!prefs || !data) && <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-calm">{status}</p>}
  </div></main>;
}
