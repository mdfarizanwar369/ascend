"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardList, LockKeyhole, Target, TrendingDown } from "lucide-react";
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
import { buildAthleteCoachInsights, CoachInsightTone, insightToneClass } from "@/lib/coachIntelligence";

const targetOptions = [
  ["steps", "Steps", "steps", "daily"], ["cardio_minutes", "Cardio", "minutes", "daily"],
  ["water_ml", "Water", "ml", "daily"], ["training_sessions", "Training sessions", "sessions", "weekly"],
  ["runs", "Runs", "sessions", "weekly"], ["strength_sessions", "Strength", "sessions", "weekly"],
  ["mobility_sessions", "Mobility", "sessions", "weekly"], ["recovery_days", "Recovery", "days", "weekly"]
] as const;

type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type AthletePanelSection = "bodyScanHistory" | "targets" | "weeklyReview" | "notes";

function InsightIcon({ tone }: { tone: CoachInsightTone }) {
  if (tone === "red" || tone === "orange" || tone === "yellow") return <AlertTriangle size={18} />;
  if (tone === "green") return <CheckCircle2 size={18} />;
  return <Target size={18} />;
}

function AthletePanelCollapsible({
  title,
  preview,
  isOpen,
  onToggle,
  children
}: {
  title: string;
  preview: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 rounded-lg border border-purple-400/20 bg-ink">
      <button type="button" aria-expanded={isOpen} onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 truncate text-xs text-zinc-400">{preview}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-zinc-200">
          <ChevronDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} size={16} />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-purple-400/20 p-3 pt-2">{children}</div>
        </div>
      </div>
    </section>
  );
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
  const [openSections, setOpenSections] = useState<Record<AthletePanelSection, boolean>>({
    bodyScanHistory: false,
    targets: false,
    weeklyReview: false,
    notes: false
  });

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

  useEffect(() => {
    setOpenSections((current) => {
      const next = { ...current };
      (Object.keys(next) as AthletePanelSection[]).forEach((key) => {
        const stored = window.sessionStorage.getItem(`athlete-coach-panel:${clientId}:${key}`);
        if (stored === "open" || stored === "closed") next[key] = stored === "open";
      });
      return next;
    });
  }, [clientId]);

  function setSectionOpen(key: AthletePanelSection, isOpen: boolean) {
    setOpenSections((current) => ({ ...current, [key]: isOpen }));
    window.sessionStorage.setItem(`athlete-coach-panel:${clientId}:${key}`, isOpen ? "open" : "closed");
  }

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
  const coachInsights = buildAthleteCoachInsights({ athlete, summary: bodyComposition, scans: bodyScans, foodLogs });

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

      <AthletePanelCollapsible
        title="Body Scan History"
        preview={bodyScans.length ? `${bodyScans.length} scans saved` : "No saved scans yet"}
        isOpen={openSections.bodyScanHistory}
        onToggle={() => setSectionOpen("bodyScanHistory", !openSections.bodyScanHistory)}
      >
        <Link href={`/trainer/clients/${clientId}/body-composition`} className="block rounded-lg border border-teal-400/40 bg-teal-400/10 p-3 !text-white transition hover:border-teal-300">
          <p className="text-sm font-semibold text-teal-200">View full Body Scan history</p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">Open trends, scan photos, progress score, and coach insights.</p>
        </Link>
      </AthletePanelCollapsible>

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

      <AthletePanelCollapsible
        title="Athlete Targets"
        preview={athlete.targets.length ? `${athlete.targets.length} active targets` : "No athlete targets set"}
        isOpen={openSections.targets}
        onToggle={() => setSectionOpen("targets", !openSections.targets)}
      >
      <form onSubmit={saveTarget} className="rounded-lg bg-ink">
        <div className="flex items-center gap-2"><ClipboardList className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Set a target</h3></div>
        <select value={targetType} onChange={(e) => chooseTarget(e.target.value)} className="ascend-field ascend-select mt-3 h-11 w-full rounded-lg border px-3 pr-10 text-sm">{targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">{(["daily", "weekly"] as const).map((value) => <button key={value} type="button" onClick={() => setCadence(value)} className={`h-9 rounded-md text-xs font-semibold capitalize ${cadence === value ? "bg-purple-500 !text-white" : "bg-ink !text-zinc-100"}`}>{value}</button>)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2"><input required type="number" min="0.1" step="0.1" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="Target" className="h-11 rounded-lg border border-line bg-surface px-3" /><input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="h-11 min-w-0 rounded-lg border border-line bg-surface px-3" /></div>
        <input value={targetNote} onChange={(e) => setTargetNote(e.target.value)} maxLength={240} placeholder="Optional instruction" className="mt-2 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
        <button disabled={saving || !targetValue} className="mt-2 h-11 w-full rounded-lg bg-purple-500 font-semibold !text-white disabled:border disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save target</button>
        <div className="mt-3 space-y-2">{athlete.targets.map((target) => <p key={target.id} className="rounded-lg bg-surface p-2 text-xs text-zinc-300"><span className="font-semibold capitalize text-purple-300">{target.cadence}</span> / {target.target_type.replaceAll("_", " ")}: {target.completed_value}/{target.target_value} {target.unit}</p>)}</div>
      </form>
      </AthletePanelCollapsible>

      <AthletePanelCollapsible
        title="Weekly Review"
        preview={athlete.latestReview ? "Review summary available" : "Appears when enough athlete data is available"}
        isOpen={openSections.weeklyReview}
        onToggle={() => setSectionOpen("weeklyReview", !openSections.weeklyReview)}
      >
      <div className="rounded-lg bg-ink">
        <h3 className="text-sm font-semibold">Weekly review note</h3>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{athlete.latestReview?.summary ?? "Weekly review appears here once enough athlete data is available."}</p>
        <textarea value={coachComment} onChange={(e) => setCoachComment(e.target.value)} maxLength={2000} rows={3} placeholder="Add a clear focus for next week" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button type="button" disabled={saving || !athlete.latestReview} onClick={saveReviewComment} className="mt-2 h-11 w-full rounded-lg border border-purple-400/60 bg-purple-400/10 font-semibold !text-purple-100 disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save review comment</button>
      </div>
      </AthletePanelCollapsible>

      <AthletePanelCollapsible
        title="Notes"
        preview={notes.length ? `${notes.length} private notes` : "No notes added yet"}
        isOpen={openSections.notes}
        onToggle={() => setSectionOpen("notes", !openSections.notes)}
      >
      <form onSubmit={saveNote} className="rounded-lg border border-line bg-ink p-3">
        <div className="flex items-center gap-2"><LockKeyhole className="text-purple-300" size={18} /><h3 className="text-sm font-semibold">Private coach notes</h3></div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">Visible only to authorized trainers and owners. Never shown to the athlete.</p>
        <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} maxLength={2000} rows={3} placeholder="Private coaching observation" className="mt-3 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm" />
        <button disabled={saving || !privateNote.trim()} className="mt-2 h-11 w-full rounded-lg bg-purple-500 font-semibold !text-white disabled:border disabled:border-zinc-600 disabled:bg-zinc-800 disabled:!text-zinc-200">Save private note</button>
        <div className="mt-3 space-y-2">{notes.slice(0, 5).map((note) => <article key={note.id} className="rounded-lg bg-surface p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{note.body}</p><p className="mt-1 text-xs text-zinc-500">{note.author_name} / {new Date(note.created_at).toLocaleDateString()}</p></article>)}{!notes.length ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">No notes added yet.</p> : null}</div>
      </form>
      </AthletePanelCollapsible>
      {status ? <p className="mt-3 text-sm text-zinc-300">{status}</p> : null}
    </section>
  );
}
