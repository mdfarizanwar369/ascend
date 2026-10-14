"use client";
import Link from "next/link";
import { CalendarDays, ChevronLeft, Clock3, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { nudgeLocalParts, nudgeWallTime, nudgeUuid } from "@ascend/shared";
import { getSmartNudgePreferences, getWorkoutSchedule, saveWorkoutSchedule, ScheduledWorkout } from "@/lib/ascendApi";
import { inputClass, selectClass } from "@/components/Field";

export function WorkoutScheduleClient() {
  const [sessions, setSessions] = useState<ScheduledWorkout[]>([]);
  const [zone, setZone] = useState("UTC");
  const [available, setAvailable] = useState(false);
  const [title, setTitle] = useState(""); const [time, setTime] = useState(""); const [lead, setLead] = useState(30);
  const [edit, setEdit] = useState<ScheduledWorkout | null>(null);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState("Loading your schedule…");
  async function load() {
    try {
      const [schedule, prefs] = await Promise.all([getWorkoutSchedule(), getSmartNudgePreferences()]);
      setSessions(schedule.sessions); setAvailable(prefs.available && prefs.categories.includes("workout"));
      setZone(prefs.version ? prefs.preferences.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone);
      setStatus(prefs.preferences.enabled && prefs.preferences.categories.workout.enabled ? "" : "Workout alerts are off. Choose them in your reminder preferences when you are ready.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not load your schedule."); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && nudgeUuid.test(id) && sessions.some(s => s.id === id)) document.getElementById(`session-${id}`)?.scrollIntoView({ block: "center" });
  }, [sessions]);
  async function update(session: ScheduledWorkout, nextStatus: ScheduledWorkout["status"]) {
    setBusy(true);
    try { await saveWorkoutSchedule({ id: session.id, version: session.version, title: session.title, startsAt: session.starts_at, leadMinutes: session.lead_minutes, status: nextStatus }); await load(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not update this session."); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); const [date, clock] = time.split("T"); const at = nudgeWallTime(date, clock, zone);
    if (!at) { setStatus("That local time does not exist because the clocks change. Please choose another time."); return; }
    setBusy(true);
    try {
      await saveWorkoutSchedule({ id: edit?.id, version: edit?.version, title, startsAt: at.toISOString(), leadMinutes: lead, status: "planned" });
      setEdit(null); setTitle(""); setTime(""); await load(); setStatus("Session saved. Alerts follow your reminder preferences and quiet hours.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save your session."); } finally { setBusy(false); }
  }
  function beginEdit(session: ScheduledWorkout) {
    const local = nudgeLocalParts(new Date(session.starts_at), zone); setEdit(session); setTitle(session.title); setTime(`${local.date}T${local.time}`); setLead(session.lead_minutes);
    document.getElementById("schedule-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return <main className="ascend-page min-h-screen px-4 pb-28 pt-6 text-white"><div className="mx-auto max-w-md">
    <Link href="/profile/reminders" className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400"><ChevronLeft size={17} /> Reminders</Link>
    <header className="mt-4"><CalendarDays className="text-lime" size={28} /><h1 className="mt-3 text-3xl font-semibold tracking-tight">Make space to move.</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Your own workout appointments, at your pace. Times are in {zone}.</p></header>
    <p role="status" className="mt-4 text-sm leading-6 text-zinc-300">{status}</p>
    {available && <form id="schedule-form" onSubmit={save} className="mt-5 space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Plus size={17} className="text-lime" /> {edit ? "Adjust your session" : "Plan a session"}</h2>
      <label className="block text-xs text-zinc-400">Session name<input required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Evening walk" className={`${inputClass} mt-2 w-full`} /></label>
      <label className="block min-w-0 text-xs text-zinc-400">Date and time<input required type="datetime-local" value={time} onChange={e => setTime(e.target.value)} className={`${inputClass} mt-2 w-full min-w-0`} /></label>
      <label className="block text-xs text-zinc-400">Remind me<select value={lead} onChange={e => setLead(Number(e.target.value))} className={`${selectClass} mt-2 w-full`}>{[0, 15, 30, 60].map(n => <option key={n} value={n}>{n === 0 ? "At the start" : `${n} minutes before`}</option>)}</select></label>
      <button disabled={busy} className="min-h-12 w-full rounded-xl bg-lime font-semibold text-ink disabled:opacity-50">{busy ? "Saving…" : "Save session"}</button>
      {edit && <button type="button" onClick={() => { setEdit(null); setTitle(""); setTime(""); }} className="min-h-11 w-full text-sm text-zinc-400">Cancel editing</button>}
      <p className="text-xs leading-5 text-zinc-500">A reminder time already in the past is skipped. This schedule records your plans; marking a session done does not add exercise statistics.</p>
    </form>}
    <section className="mt-6 space-y-3"><h2 className="text-sm font-semibold text-zinc-300">Your sessions</h2>
      {!sessions.length && <p className="rounded-2xl border border-dashed border-line p-6 text-sm leading-6 text-zinc-500">Nothing planned yet. Add a session when it suits you.</p>}
      {sessions.filter(s => s.status === "planned").map(session => <article key={session.id} id={`session-${session.id}`} className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="break-words font-semibold">{session.title}</h3><p className="mt-2 flex items-center gap-2 text-xs text-zinc-400"><Clock3 size={14} />{new Date(session.starts_at).toLocaleString(undefined, { timeZone: zone, dateStyle: "medium", timeStyle: "short" })}</p>
        {available && <><div className="mt-3 grid grid-cols-3 gap-2"><button disabled={busy} onClick={() => beginEdit(session)} className="min-h-11 rounded-lg border border-line text-xs text-calm">Reschedule</button><button disabled={busy} onClick={() => void update(session, "completed")} className="min-h-11 rounded-lg border border-line text-xs text-lime">Mark done</button><button disabled={busy} onClick={() => void update(session, "cancelled")} className="min-h-11 rounded-lg border border-line text-xs text-zinc-400">Cancel</button></div>
        <Link href={`/burn-log?schedule=${session.id}`} className="mt-2 flex min-h-11 items-center justify-center text-xs text-lime">Log this completed workout</Link></>}
      </article>)}
      {sessions.some(s => s.status !== "planned") && <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm text-zinc-400">Recent completed & cancelled sessions</summary>{sessions.filter(s => s.status !== "planned").map(s => <p key={s.id} className="mt-3 text-xs text-zinc-500">{s.title} · {s.status}</p>)}</details>}
    </section>
  </div></main>;
}
