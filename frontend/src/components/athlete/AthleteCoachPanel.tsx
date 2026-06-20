"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClipboardList, LockKeyhole } from "lucide-react";
import {
  AthleteDashboard,
  createAthleteCoachNote,
  createAthleteTarget,
  getAthleteCoachNotes,
  getTrainerAthleteDashboard,
  updateAthleteReviewComment
} from "@/lib/ascendApi";

const targetOptions = [
  ["steps", "Steps", "steps"], ["cardio_minutes", "Cardio", "minutes"], ["runs", "Runs", "sessions"],
  ["strength_sessions", "Strength", "sessions"], ["mobility_sessions", "Mobility", "sessions"], ["recovery_days", "Recovery", "days"]
] as const;

export function AthleteCoachPanel({ clientId }: { clientId: string }) {
  const [athlete, setAthlete] = useState<AthleteDashboard | null>(null);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; author_name: string; created_at: string }>>([]);
  const [targetType, setTargetType] = useState("steps");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("steps");
  const [targetNote, setTargetNote] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [coachComment, setCoachComment] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await getTrainerAthleteDashboard(clientId);
      setAthlete(response.athlete);
      setCoachComment(response.athlete.latestReview?.coach_comment ?? "");
      const noteResponse = await getAthleteCoachNotes(clientId);
      setNotes(noteResponse.notes);
    } catch {
      setAthlete(null);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  function chooseTarget(nextType: string) {
    setTargetType(nextType);
    const option = targetOptions.find(([value]) => value === nextType);
    setUnit(option?.[2] ?? "sessions");
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createAthleteTarget(clientId, { targetType, targetValue: Number(targetValue), unit, notes: targetNote || undefined });
      setTargetValue(""); setTargetNote(""); await load(); setStatus("Weekly target saved.");
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

  return (
    <section className="mt-4 rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-purple-300">Athlete Mode</p><h2 className="mt-1 text-xl font-semibold">Coach control panel</h2></div><span className="rounded-lg bg-ink px-3 py-2 text-sm text-purple-300">{athlete.compliancePercent}%</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Readiness</p><p className="mt-1 text-xl font-semibold">{athlete.latestCheckin?.readiness_score ?? "--"}/100</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Event</p><p className="mt-1 text-xl font-semibold">{athlete.countdown ? `${Math.max(0, athlete.countdown.days)} days` : "Not set"}</p></div>
      </div>

      <form onSubmit={saveTarget} className="mt-4 rounded-lg bg-ink p-3">
        <div className="flex items-center gap-2"><ClipboardList className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Weekly target</h3></div>
        <select value={targetType} onChange={(e) => chooseTarget(e.target.value)} className="mt-3 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">{targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <div className="mt-2 grid grid-cols-2 gap-2"><input required type="number" min="0.1" step="0.1" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="Target" className="h-11 rounded-lg border border-line bg-surface px-3" /><input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="h-11 min-w-0 rounded-lg border border-line bg-surface px-3" /></div>
        <input value={targetNote} onChange={(e) => setTargetNote(e.target.value)} maxLength={240} placeholder="Optional instruction" className="mt-2 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        <button disabled={saving || !targetValue} className="mt-2 h-11 w-full rounded-lg bg-purple-400 font-semibold text-ink disabled:opacity-60">Save weekly target</button>
        <div className="mt-3 space-y-2">{athlete.targets.map((target) => <p key={target.id} className="rounded-lg bg-surface p-2 text-xs text-zinc-300">{target.target_type.replaceAll("_", " ")}: {target.completed_value}/{target.target_value} {target.unit}</p>)}</div>
      </form>

      <div className="mt-4 rounded-lg bg-ink p-3">
        <h3 className="text-sm font-semibold">Weekly review comment</h3>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{athlete.latestReview?.summary ?? "The athlete has not generated this week's review yet."}</p>
        <textarea value={coachComment} onChange={(e) => setCoachComment(e.target.value)} maxLength={2000} rows={3} placeholder="Add a clear focus for next week" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button type="button" disabled={saving || !athlete.latestReview} onClick={saveReviewComment} className="mt-2 h-11 w-full rounded-lg border border-purple-400/50 font-semibold text-purple-300 disabled:opacity-50">Save review comment</button>
      </div>

      <form onSubmit={saveNote} className="mt-4 rounded-lg border border-line bg-ink p-3">
        <div className="flex items-center gap-2"><LockKeyhole className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Private coach notes</h3></div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">Visible only to authorized trainers and owners. Never shown to the athlete.</p>
        <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} maxLength={2000} rows={3} placeholder="Private coaching observation" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button disabled={saving || !privateNote.trim()} className="mt-2 h-11 w-full rounded-lg bg-purple-400 font-semibold text-ink disabled:opacity-60">Save private note</button>
        <div className="mt-3 space-y-2">{notes.slice(0, 5).map((note) => <article key={note.id} className="rounded-lg bg-surface p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{note.body}</p><p className="mt-1 text-xs text-zinc-500">{note.author_name} / {new Date(note.created_at).toLocaleDateString()}</p></article>)}</div>
      </form>
      {status ? <p className="mt-3 text-sm text-zinc-300">{status}</p> : null}
    </section>
  );
}
