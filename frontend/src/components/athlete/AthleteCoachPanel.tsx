"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, LockKeyhole } from "lucide-react";
import {
  AthleteDashboard,
  createAthleteCoachNote,
  createAthleteTarget,
  getAthleteCoachNotes,
  getTrainerBodyComposition,
  getTrainerAthleteDashboard,
  BodyCompositionSummary,
  updateAthleteReviewComment
} from "@/lib/ascendApi";

const targetOptions = [
  ["steps", "Steps", "steps", "daily"], ["cardio_minutes", "Cardio", "minutes", "daily"],
  ["water_ml", "Water", "ml", "daily"], ["training_sessions", "Training sessions", "sessions", "weekly"],
  ["runs", "Runs", "sessions", "weekly"], ["strength_sessions", "Strength", "sessions", "weekly"],
  ["mobility_sessions", "Mobility", "sessions", "weekly"], ["recovery_days", "Recovery", "days", "weekly"]
] as const;

export function AthleteCoachPanel({ clientId }: { clientId: string }) {
  const [athlete, setAthlete] = useState<AthleteDashboard | null>(null);
  const [bodyComposition, setBodyComposition] = useState<BodyCompositionSummary | null>(null);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; author_name: string; created_at: string }>>([]);
  const [targetType, setTargetType] = useState("steps");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("steps");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [targetNote, setTargetNote] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [coachComment, setCoachComment] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [response, bodyResponse] = await Promise.all([
        getTrainerAthleteDashboard(clientId),
        getTrainerBodyComposition(clientId).catch(() => null)
      ]);
      setAthlete(response.athlete);
      setBodyComposition(bodyResponse?.summary ?? null);
      setCoachComment(response.athlete.latestReview?.coach_comment ?? "");
      const noteResponse = await getAthleteCoachNotes(clientId);
      setNotes(noteResponse.notes);
    } catch {
      setAthlete(null);
      setBodyComposition(null);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  function chooseTarget(nextType: string) {
    setTargetType(nextType);
    const option = targetOptions.find(([value]) => value === nextType);
    setUnit(option?.[2] ?? "sessions");
    setCadence(option?.[3] ?? "weekly");
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createAthleteTarget(clientId, { targetType, cadence, targetValue: Number(targetValue), unit, notes: targetNote || undefined });
      setTargetValue(""); setTargetNote(""); await load(); setStatus("Target saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save target."); }
    finally { setSaving(false); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!privateNote.trim()) return;
    setSaving(true);
    try { await createAthleteCoachNote(clientId, privateNote.trim()); setPrivateNote(""); await load(); setStatus("Private coach note saved."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not save private note."); }
    finally { setSaving(false); }
  }

  async function saveReviewComment() {
    setSaving(true);
    try { await updateAthleteReviewComment(clientId, coachComment.trim() || null); await load(); setStatus("Coach review saved."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Generate the weekly athlete review first."); }
    finally { setSaving(false); }
  }

  if (!athlete) return null;
  const latestScan = bodyComposition?.latestScan ?? null;
  const dnaScore = bodyComposition?.dnaScore.current ?? null;

  return (
    <section className="mt-4 rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-purple-300">Athlete Mode</p><h2 className="mt-1 text-xl font-semibold">Coach Snapshot</h2><p className="mt-1 text-xs leading-5 text-zinc-400">Readiness, body scan, and targets in one place.</p></div><span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-purple-200">{athlete.compliancePercent}%</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Readiness</p><p className="mt-1 text-xl font-semibold">{athlete.readiness.score ?? "--"}/100</p><p className="mt-1 text-xs text-zinc-500">{athlete.readiness.status}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Event</p><p className="mt-1 text-xl font-semibold">{athlete.countdown ? `${Math.max(0, athlete.countdown.days)} days` : "Not set"}</p></div>
      </div>

      {athlete.readiness.warningReasons.length ? <div className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 p-3"><p className="text-sm font-semibold text-red-300">Coach review recommended</p>{athlete.readiness.warningReasons.map((reason) => <p key={reason} className="mt-1 text-xs text-zinc-300">- {reason}</p>)}</div> : null}

      <Link href={`/trainer/clients/${clientId}/body-composition`} className="mt-3 block rounded-lg border border-teal-400/40 bg-teal-400/10 p-3 !text-white transition hover:border-teal-300">
        <p className="text-sm font-semibold text-teal-200">View full Body Scan history</p>
        <p className="mt-1 text-xs leading-5 text-zinc-300">Open trends, scan photos, progress score, and coach insights.</p>
      </Link>

      <div className="mt-3 rounded-lg border border-teal-400/30 bg-ink p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-teal-200">Latest Body Scan</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {latestScan
                ? `${latestScan.machine || "Body composition scan"} / ${new Date(latestScan.scanDate).toLocaleDateString()}`
                : "No body scan saved yet."}
            </p>
          </div>
          <span className="rounded-lg border border-purple-400/40 bg-purple-400/10 px-3 py-2 text-xs font-semibold text-purple-100">
            DNA {dnaScore ?? "--"}
          </span>
        </div>
        {latestScan ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs text-zinc-500">Weight</p>
              <p className="mt-1 text-lg font-semibold">{latestScan.weightKg ?? "--"}kg</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs text-zinc-500">Body fat</p>
              <p className="mt-1 text-lg font-semibold">{latestScan.bodyFatPercent ?? "--"}%</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs text-zinc-500">Skeletal muscle</p>
              <p className="mt-1 text-lg font-semibold">{latestScan.skeletalMuscleMassKg ?? "--"}kg</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs text-zinc-500">Visceral fat</p>
              <p className="mt-1 text-lg font-semibold">{latestScan.visceralFat ?? "--"}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-surface p-3 text-sm leading-6 text-zinc-300">
            Ask the athlete to upload their first body scan so nutrition and progress reviews can use scan data.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-ink p-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">7-day readiness</p><span className={`text-xs font-semibold ${athlete.readinessTrend.direction === "declining" ? "text-amber" : "text-lime"}`}>{athlete.readinessTrend.direction}</span></div>
        <div className="mt-3 grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, index) => {
          const item = athlete.readinessTrend.days[index];
          return <div key={index} className="text-center"><div className={`mx-auto h-8 w-full rounded ${item?.band === "green" ? "bg-lime" : item?.band === "yellow" ? "bg-amber" : item ? "bg-red-400" : "bg-surface"}`} style={{ opacity: item ? Math.max(0.45, item.score / 100) : 1 }} /><p className="mt-1 text-[10px] text-zinc-500">{item?.score ?? "–"}</p></div>;
        })}</div>
      </div>

      <form onSubmit={saveTarget} className="mt-4 rounded-lg bg-ink p-3">
        <div className="flex items-center gap-2"><ClipboardList className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Set a target</h3></div>
        <select value={targetType} onChange={(e) => chooseTarget(e.target.value)} className="mt-3 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">{targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">{(["daily", "weekly"] as const).map((value) => <button key={value} type="button" onClick={() => setCadence(value)} className={`h-9 rounded-md text-xs font-semibold capitalize ${cadence === value ? "bg-purple-500 !text-white" : "bg-ink !text-zinc-100"}`}>{value}</button>)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2"><input required type="number" min="0.1" step="0.1" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="Target" className="h-11 rounded-lg border border-line bg-surface px-3" /><input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="h-11 min-w-0 rounded-lg border border-line bg-surface px-3" /></div>
        <input value={targetNote} onChange={(e) => setTargetNote(e.target.value)} maxLength={240} placeholder="Optional instruction" className="mt-2 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        <button disabled={saving || !targetValue} className="mt-2 h-11 w-full rounded-lg bg-purple-500 font-semibold !text-white disabled:border disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save target</button>
        <div className="mt-3 space-y-2">{athlete.targets.map((target) => <p key={target.id} className="rounded-lg bg-surface p-2 text-xs text-zinc-300"><span className="font-semibold capitalize text-purple-300">{target.cadence}</span> / {target.target_type.replaceAll("_", " ")}: {target.completed_value}/{target.target_value} {target.unit}</p>)}</div>
      </form>

      <div className="mt-4 rounded-lg bg-ink p-3">
        <h3 className="text-sm font-semibold">Weekly review note</h3>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{athlete.latestReview?.summary ?? "Weekly review appears here once enough athlete data is available."}</p>
        <textarea value={coachComment} onChange={(e) => setCoachComment(e.target.value)} maxLength={2000} rows={3} placeholder="Add a clear focus for next week" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button type="button" disabled={saving || !athlete.latestReview} onClick={saveReviewComment} className="mt-2 h-11 w-full rounded-lg border border-purple-400/60 bg-purple-400/10 font-semibold !text-purple-100 disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save review comment</button>
      </div>

      <form onSubmit={saveNote} className="mt-4 rounded-lg border border-line bg-ink p-3">
        <div className="flex items-center gap-2"><LockKeyhole className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Private coach notes</h3></div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">Visible only to authorized trainers and owners. Never shown to the athlete.</p>
        <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} maxLength={2000} rows={3} placeholder="Private coaching observation" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button disabled={saving || !privateNote.trim()} className="mt-2 h-11 w-full rounded-lg bg-purple-500 font-semibold !text-white disabled:border disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save private note</button>
        <div className="mt-3 space-y-2">{notes.slice(0, 5).map((note) => <article key={note.id} className="rounded-lg bg-surface p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{note.body}</p><p className="mt-1 text-xs text-zinc-500">{note.author_name} / {new Date(note.created_at).toLocaleDateString()}</p></article>)}{!notes.length ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">No notes added yet.</p> : null}</div>
      </form>
      {status ? <p className="mt-3 text-sm text-zinc-300">{status}</p> : null}
    </section>
  );
}
