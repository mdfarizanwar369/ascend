"use client";
import { useEffect,useState } from "react";
import type { DailyActivitySummary,HealthExternalWorkout } from "@ascend/shared";
import { getHealthWorkoutHistory,saveHealthManualAdjustment } from "@/lib/ascendApi";

export function HealthWorkoutHistory({ today,onChanged }: { today:DailyActivitySummary; onChanged:() => Promise<void> }) {
  const [day,setDay] = useState(today.day);
  const [workouts,setWorkouts] = useState<HealthExternalWorkout[]>([]);
  const [next,setNext] = useState<string | null>(null);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [timezone,setTimezone] = useState(today.timezone);
  const [links,setLinks] = useState<Record<string,string>>({});
  useEffect(() => {
    let active=true;
    setBusy(true); setWorkouts([]); setNext(null); setLinks({});
    void getHealthWorkoutHistory(day).then(result => { if (active) { setWorkouts(result.workouts); setNext(result.nextCursor); setTimezone(result.timezone ?? today.timezone); setMessage(""); } })
      .catch(() => { if (active) { setWorkouts([]); setNext(null); setMessage("Could not load imported workouts. Please sync and try again."); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active=false; };
  },[day,today.observedAt,today.workoutCount,today.timezone]);
  async function more() {
    if (!next) return;
    setBusy(true);
    try { const result=await getHealthWorkoutHistory(day,next); setWorkouts(current => [...current,...result.workouts]); setNext(result.nextCursor); }
    catch { setMessage("Could not load the next page. Try again."); }
    finally { setBusy(false); }
  }
  async function link(activityId: string) {
    const externalId=links[activityId]; if (!externalId) return;
    setBusy(true);
    try {
      await saveHealthManualAdjustment(activityId,null,false,externalId); await onChanged();
      window.dispatchEvent(new Event("ascend:health-updated")); setMessage("Manual log linked. This recorded workout is counted once.");
    } catch { setMessage("Could not link this workout. Your existing records are unchanged."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
    <h2 className="font-semibold">Imported workouts</h2>
    <label className="mt-3 block text-xs text-zinc-400">Reporting date<input type="date" disabled={busy} value={day} max={today.day} onChange={event => { if (event.target.value) setDay(event.target.value); }} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
    <p className="mt-2 text-xs text-zinc-400">Reporting timezone: {timezone}</p>
    {busy && <p role="status" className="mt-3 text-sm text-zinc-400">Updating workout history…</p>}
    {!busy && !workouts.length && !message && <p className="mt-3 text-sm text-zinc-400">No readable workouts for this date. Daily energy can still include movement without a workout record.</p>}
    {[...workouts].sort((a,b) => b.startAt.localeCompare(a.startAt)).map(workout => <div key={workout.externalId} className="mt-4 border-t border-line pt-3">
      <p className="text-sm font-semibold">{workout.activityType}</p>
      <p className="mt-1 text-xs text-zinc-400">{workout.sourceName ?? "Apple Health"} · {new Date(workout.startAt).toLocaleTimeString([],{ hour:"2-digit",minute:"2-digit",timeZone:timezone })} · {Math.round((Date.parse(workout.endAt)-Date.parse(workout.startAt))/60000)} min</p>
      <p className="mt-1 text-sm text-zinc-300">{workout.activeCalories===null ? "No readable active energy" : `${Math.round(workout.activeCalories)} estimated active kcal · included in daily energy when available`}</p>
    </div>)}
    {next && <button type="button" disabled={busy} onClick={() => void more()} className="mt-4 min-h-11 w-full rounded-lg border border-line text-sm">Load more imported workouts</button>}
    {today.workoutCountAmbiguous && <p className="mt-3 text-xs text-amber">Some manual and imported workouts may overlap. Match only records you know are the same activity.</p>}
    {day===today.day && workouts.length>0 && [...today.excludedManual.filter(entry => entry.reason!=="already_included"),...today.manualAdjustments].map(entry => <div key={entry.id} className="mt-4 border-t border-line pt-3">
      <label className="block text-xs text-zinc-400">Only if this is the same workout as your manual log: {entry.label}<select value={links[entry.id] ?? ""} onChange={event => setLinks(values => ({ ...values,[entry.id]:event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-2 text-white"><option value="">Do not match</option>{workouts.map(workout => <option key={workout.externalId} value={workout.externalId}>{workout.activityType} · {new Date(workout.startAt).toLocaleTimeString([],{ hour:"2-digit",minute:"2-digit",timeZone:timezone })}</option>)}</select></label>
      <button type="button" disabled={busy || !links[entry.id]} onClick={() => void link(entry.id)} className="mt-2 min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50">Confirm same workout</button>
    </div>)}
    {message && <p role="status" className="mt-3 text-sm text-zinc-400">{message}</p>}
  </section>;
}
