"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, LockKeyhole, Target, TrendingDown } from "lucide-react";
import {
  AthleteDashboard,
  BodyCompositionScan,
  createAthleteCoachNote,
  createAthleteTarget,
  getAthleteCoachNotes,
  getTrainerClientFoodLogs,
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

type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type CoachInsightTone = "red" | "orange" | "yellow" | "green" | "blue";
type CoachInsight = {
  tone: CoachInsightTone;
  title: string;
  explanation: string;
  action: string;
  priority: number;
};

function numberOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function dayDiff(date?: string | null) {
  if (!date) return null;
  const scanDate = new Date(date);
  if (Number.isNaN(scanDate.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startScan = new Date(scanDate.getFullYear(), scanDate.getMonth(), scanDate.getDate()).getTime();
  return Math.floor((startToday - startScan) / 86_400_000);
}

function foodLogsInWindow(foodLogs: FoodLog[], startDaysAgo: number, endDaysAgo: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - startDaysAgo).getTime();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - endDaysAgo + 1).getTime();
  return foodLogs.filter((log) => {
    const logged = new Date(log.logged_at).getTime();
    return logged >= start && logged < end;
  }).length;
}

function bodyFatPlateau(scans: BodyCompositionScan[]) {
  const withBodyFat = scans.filter((scan) => numberOrNull(scan.bodyFatPercent) !== null).slice(0, 3);
  if (withBodyFat.length < 3) return false;
  const newest = numberOrNull(withBodyFat[0].bodyFatPercent);
  const oldest = numberOrNull(withBodyFat[withBodyFat.length - 1].bodyFatPercent);
  if (newest === null || oldest === null) return false;
  return oldest - newest < 0.3;
}

function buildCoachInsights(athlete: AthleteDashboard, summary: BodyCompositionSummary | null, scans: BodyCompositionScan[], foodLogs: FoodLog[]) {
  const insights: CoachInsight[] = [];
  const latest = summary?.latestScan ?? scans[0] ?? null;
  const previous = summary?.previousScan ?? scans[1] ?? null;
  const latestMuscle = numberOrNull(latest?.skeletalMuscleMassKg ?? latest?.muscleMassKg);
  const previousMuscle = numberOrNull(previous?.skeletalMuscleMassKg ?? previous?.muscleMassKg);
  const latestBodyFat = numberOrNull(latest?.bodyFatPercent);
  const previousBodyFat = numberOrNull(previous?.bodyFatPercent);

  if (latestMuscle !== null && previousMuscle !== null && latestMuscle < previousMuscle - 0.2) {
    insights.push({
      tone: "red",
      title: "Muscle loss detected",
      explanation: `Skeletal muscle is down by ${(previousMuscle - latestMuscle).toFixed(1)}kg since the previous scan.`,
      action: "Review protein intake and resistance training.",
      priority: 100
    });
  }

  if (bodyFatPlateau(scans)) {
    insights.push({
      tone: "orange",
      title: "Body fat plateau",
      explanation: "Body fat has not meaningfully improved across the recent scans.",
      action: "Consider reviewing calorie intake or increasing activity.",
      priority: 80
    });
  }

  const scanAge = dayDiff(latest?.scanDate);
  if (scanAge === null) {
    insights.push({
      tone: "yellow",
      title: "No Body Scan yet",
      explanation: "This athlete does not have a confirmed Body Scan baseline yet.",
      action: "Invite client for their first Body Scan.",
      priority: 70
    });
  } else if (scanAge > 28) {
    insights.push({
      tone: "yellow",
      title: "Body Scan overdue",
      explanation: `Last Body Scan was ${scanAge} days ago.`,
      action: "Invite client for another Body Scan.",
      priority: 70
    });
  }

  const recentFoodLogs = foodLogsInWindow(foodLogs, 6, 0);
  const previousFoodLogs = foodLogsInWindow(foodLogs, 13, 7);
  if (previousFoodLogs >= 4 && recentFoodLogs <= Math.max(2, Math.floor(previousFoodLogs * 0.5))) {
    insights.push({
      tone: "yellow",
      title: "Nutrition consistency low",
      explanation: `Food logging dropped from ${previousFoodLogs} to ${recentFoodLogs} logs compared with the previous week.`,
      action: "Check in with client.",
      priority: 60
    });
  }

  if (latestBodyFat !== null && previousBodyFat !== null && latestBodyFat < previousBodyFat - 0.3 && (latestMuscle ?? 0) >= (previousMuscle ?? 0) - 0.1) {
    insights.push({
      tone: "green",
      title: "Excellent progress",
      explanation: "Body fat decreased while muscle stayed stable or improved.",
      action: "Continue current plan.",
      priority: 40
    });
  }

  const goalWeight = numberOrNull(athlete.profile.goal_weight_kg);
  const latestWeight = numberOrNull(latest?.weightKg ?? athlete.profile.current_weight_kg);
  if (goalWeight !== null && latestWeight !== null && Math.abs(latestWeight - goalWeight) <= Math.max(1, goalWeight * 0.1)) {
    insights.push({
      tone: "blue",
      title: "Goal approaching",
      explanation: "Client is within approximately 10% of the goal weight.",
      action: "Begin planning the maintenance phase.",
      priority: 30
    });
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

function insightToneClass(tone: CoachInsightTone) {
  if (tone === "red") return "border-red-400/50 bg-red-400/10 text-red-200";
  if (tone === "orange") return "border-orange-400/50 bg-orange-400/10 text-orange-200";
  if (tone === "yellow") return "border-amber/50 bg-amber/10 text-amber";
  if (tone === "green") return "border-teal-400/50 bg-teal-400/10 text-teal-200";
  return "border-blue-400/50 bg-blue-400/10 text-blue-200";
}

function InsightIcon({ tone }: { tone: CoachInsightTone }) {
  if (tone === "red" || tone === "orange" || tone === "yellow") return <AlertTriangle size={18} />;
  if (tone === "green") return <CheckCircle2 size={18} />;
  return <Target size={18} />;
}

export function AthleteCoachPanel({ clientId }: { clientId: string }) {
  const [athlete, setAthlete] = useState<AthleteDashboard | null>(null);
  const [bodyComposition, setBodyComposition] = useState<BodyCompositionSummary | null>(null);
  const [bodyScans, setBodyScans] = useState<BodyCompositionScan[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
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
      const [response, bodyResponse, foodResponse] = await Promise.all([
        getTrainerAthleteDashboard(clientId),
        getTrainerBodyComposition(clientId).catch(() => null),
        getTrainerClientFoodLogs(clientId, { range: "30d", limit: 200 }).catch(() => null)
      ]);
      setAthlete(response.athlete);
      setBodyComposition(bodyResponse?.summary ?? null);
      setBodyScans(bodyResponse?.scans ?? []);
      setFoodLogs(foodResponse?.foodLogs ?? []);
      setCoachComment(response.athlete.latestReview?.coach_comment ?? "");
      const noteResponse = await getAthleteCoachNotes(clientId);
      setNotes(noteResponse.notes);
    } catch {
      setAthlete(null);
      setBodyComposition(null);
      setBodyScans([]);
      setFoodLogs([]);
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
  const coachInsights = buildCoachInsights(athlete, bodyComposition, bodyScans, foodLogs);

  return (
    <section className="mt-4 rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-purple-300">Athlete Mode</p><h2 className="mt-1 text-xl font-semibold">Coach Snapshot</h2><p className="mt-1 text-xs leading-5 text-zinc-400">Readiness, body scan, and targets in one place.</p></div><span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-purple-200">{athlete.compliancePercent}%</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Readiness</p><p className="mt-1 text-xl font-semibold">{athlete.readiness.score ?? "--"}/100</p><p className="mt-1 text-xs text-zinc-500">{athlete.readiness.status}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-400">Event</p><p className="mt-1 text-xl font-semibold">{athlete.countdown ? `${Math.max(0, athlete.countdown.days)} days` : "Not set"}</p></div>
      </div>

      {athlete.readiness.warningReasons.length ? <div className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 p-3"><p className="text-sm font-semibold text-red-300">Coach review recommended</p>{athlete.readiness.warningReasons.map((reason) => <p key={reason} className="mt-1 text-xs text-zinc-300">- {reason}</p>)}</div> : null}

      <section className="mt-3 rounded-lg border border-teal-400/40 bg-ink p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-teal-300">Coach Intelligence</p>
            <h3 className="mt-1 text-lg font-semibold">Needs attention today</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">Ranked coaching cues from recent Body Scans, food logs, and athlete check-ins.</p>
          </div>
          <TrendingDown className="mt-1 text-teal-300" size={20} />
        </div>
        <div className="mt-3 space-y-2">
          {coachInsights.length ? coachInsights.map((insight) => (
            <article key={insight.title} className={`rounded-lg border p-3 ${insightToneClass(insight.tone)}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0"><InsightIcon tone={insight.tone} /></div>
                <div>
                  <p className="font-semibold">{insight.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{insight.explanation}</p>
                  <p className="mt-2 text-xs font-semibold text-white">Suggested action: {insight.action}</p>
                </div>
              </div>
            </article>
          )) : (
            <article className="rounded-lg border border-teal-400/40 bg-teal-400/10 p-3 text-teal-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="font-semibold">No urgent coaching action</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">This athlete has no high-priority body scan or nutrition consistency flags today.</p>
                  <p className="mt-2 text-xs font-semibold text-white">Suggested action: Keep the current plan visible and positive.</p>
                </div>
              </div>
            </article>
          )}
        </div>
      </section>

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
