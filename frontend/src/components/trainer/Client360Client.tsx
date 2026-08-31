"use client";

import type {
  Client360CoachingSignal,
  Client360Metric,
  Client360Section,
  Client360Snapshot,
  Client360Trend,
  CoachInsightAvailability
} from "@ascend/shared";
import {
  Activity,
  AlertCircle,
  Apple,
  ChevronDown,
  Dumbbell,
  HeartPulse,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AscendHeroPanel, PrioritySigil } from "@/components/AscendVisualIdentity";
import { DashboardHeroSkeleton, SectionShell, SkeletonCardList, SkeletonStatGrid } from "@/components/PerceivedLoading";
import { getClient360, refreshCoachInsight } from "@/lib/ascendCoachApi";

const DAY_MS = 86_400_000;

function label(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not available";
}

function relativeTime(value?: string | null) {
  if (!value) return "No recent data";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function percentage(value: number | null) {
  return value === null ? "Not enough data yet" : `${Math.round(value * 100)}%`;
}

function metricValue<T>(metric: Client360Metric<T>, format: (value: T) => string) {
  return metric.sufficientData && metric.value !== null ? format(metric.value) : "Not enough data yet";
}

function trendText(trend: Client360Trend, unit = "") {
  if (!trend.sufficientData || trend.direction === "insufficient") return "Not enough data yet";
  const rate = trend.ratePerWeek === null ? "" : ` (${trend.ratePerWeek > 0 ? "+" : ""}${trend.ratePerWeek}${unit}/week)`;
  return `${label(trend.direction)}${rate}`;
}

function signalCopy(signal: Client360CoachingSignal) {
  const number = (key: string) => typeof signal.evidence[key] === "number" ? signal.evidence[key] as number : null;
  switch (signal.code) {
    case "TRAINING_INACTIVITY": return `No workout has been recorded for ${number("daysSinceLastWorkout") ?? "several"} days.`;
    case "TRAINING_FREQUENCY_DECLINING": return `Training frequency decreased by ${Math.abs(number("ratePerWeek") ?? 0)} session(s) per week compared with the previous four weeks.`;
    case "TRAINING_LOGGING_CONSISTENT": return `Workouts were recorded in ${number("activeWeeks") ?? 0} of the last ${number("windowWeeks") ?? 8} weeks.`;
    case "STRENGTH_PROGRESSING": return `Recorded progression appears in ${number("exerciseCount") ?? 0} exercises over the last ${number("windowDays") ?? 30} days.`;
    case "NUTRITION_LOGGING_LOW": return `Nutrition was logged on ${number("daysLogged") ?? 0} of the last ${number("windowDays") ?? 7} days.`;
    case "PROTEIN_TARGET_FREQUENTLY_MISSED": return `Protein target was met on ${Math.round((number("targetMetRate") ?? 0) * 100)}% of logged days.`;
    case "POTENTIAL_WEIGHT_PLATEAU": return `Weight changed by about ${number("rateKgPerWeek") ?? 0} kg per week across ${number("observedSpanDays") ?? 0} observed days.`;
  }
}

function signalSeverityLabel(signal: Client360CoachingSignal) {
  if (signal.severity === "attention") return "Needs attention";
  if (signal.severity === "positive") return "Positive";
  return "Information";
}

function Stat({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink/35 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">{title}</p>
      <p className="mt-2 break-words text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{detail}</p>
    </div>
  );
}

function ScopeUnavailable({ section }: { section: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink/30 p-4">
      <p className="text-sm text-zinc-400">{section} data is not shared with this trainer.</p>
    </div>
  );
}

function Section({ id, title, icon, children, open = false }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  return (
    <details id={id} open={open} className="group rounded-2xl border border-line bg-surface shadow-soft">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-calm/10 text-calm">{icon}</span>
        <span className="flex-1 font-semibold">{title}</span>
        <ChevronDown className="text-zinc-500 transition-transform group-open:rotate-180" size={19} />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

function Signals({ signals }: { signals: Client360CoachingSignal[] }) {
  if (!signals.length) return <p className="text-sm leading-6 text-zinc-400">No high-confidence coaching signals are available yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {signals.slice(0, 4).map((signal) => (
        <div key={signal.code} className={`rounded-xl border p-3 ${signal.severity === "attention" ? "border-amber/35 bg-amber/10" : signal.severity === "positive" ? "border-lime/30 bg-lime/10" : "border-calm/30 bg-calm/10"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{signalSeverityLabel(signal)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">{label(signal.code)}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{signalCopy(signal)}</p>
        </div>
      ))}
    </div>
  );
}

function ZoeInsightCard({ clientId, value, onChange }: { clientId: string; value: CoachInsightAvailability; onChange: (value: CoachInsightAvailability) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  async function refresh() {
    setRefreshing(true);
    setFailed(false);
    try {
      const result = await refreshCoachInsight(clientId);
      onChange(result.coachInsight);
      setFailed(result.coachInsight.status !== "available");
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }
  const elevated = value.status === "not_available" && value.reason === "elevated_access";
  const accessRequired = value.status === "not_available" && value.reason === "access_required";
  return (
    <section className="rounded-2xl border border-purple-300/30 bg-gradient-to-br from-purple-500/15 via-surface to-calm/10 p-4 shadow-soft" aria-labelledby="zoe-insight-title">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/20 text-purple-200"><Sparkles size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="ascend-eyebrow text-purple-200">Trainer intelligence</p>
          <h2 id="zoe-insight-title" className="mt-1 text-lg font-semibold">Zoe Coach Insight</h2>
          <p className="mt-1 text-xs text-zinc-500">Evidence assistant · Trainer decides</p>
        </div>
      </div>
      {value.status === "available" ? (
        <div className="mt-4">
          <p className="text-sm leading-7 text-zinc-200">{value.insight.summary}</p>
          <div className="mt-4 space-y-2">
            {value.insight.priorities.map((priority) => (
              <div key={`${priority.title}-${priority.reason}`} className="rounded-xl border border-line bg-ink/35 p-3">
                <p className="font-semibold">{priority.title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{priority.reason}</p>
              </div>
            ))}
          </div>
          {value.insight.dataCaveats.length ? <p className="mt-3 text-xs leading-5 text-zinc-500">Data note: {value.insight.dataCaveats.join(" ")}</p> : null}
          <p className="mt-3 text-xs text-zinc-500">Generated {relativeTime(value.generatedAt)} · cached</p>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          {elevated ? "Zoe insight is not generated during temporary elevated access." : accessRequired ? "Profile and training access are required for Zoe insight." : failed || value.reason === "generation_failed" ? "Zoe insight isn't available right now. Client 360 data is unaffected." : value.reason === "quota_reached" ? "The configured Coach Insight limit has been reached." : "No Zoe insight has been generated for this evidence yet."}
        </p>
      )}
      {failed && value.status === "available" ? <p className="mt-3 text-sm text-amber" role="status">Zoe insight isn't available right now. The cached insight and Client 360 data are unaffected.</p> : null}
      {!elevated && !accessRequired ? (
        <button type="button" onClick={refresh} disabled={refreshing} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-purple-300/35 bg-purple-500/15 px-4 font-semibold text-purple-100 disabled:opacity-60" aria-live="polite">
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={18} /> {refreshing ? "Generating one insight…" : value.status === "available" ? "Refresh Zoe insight" : "Generate Zoe insight"}
        </button>
      ) : null}
    </section>
  );
}

function authorized(snapshot: Client360Snapshot, section: Client360Section) {
  return snapshot.access.sections[section].state !== "not_granted";
}

function Client360Content({ snapshot, initialInsight }: { snapshot: Client360Snapshot; initialInsight: CoachInsightAvailability }) {
  const [insight, setInsight] = useState(initialInsight);
  const training = snapshot.training;
  const nutrition = snapshot.nutrition;
  const body = snapshot.bodyProgress;
  const activity = snapshot.activity;
  const topSignals = [...snapshot.coachingSignals].sort((left, right) => {
    const rank = { attention: 0, positive: 1, information: 2 };
    return rank[left.severity] - rank[right.severity];
  });
  return (
    <div className="pb-5">
      <AscendHeroPanel
        eyebrow="Client 360"
        title={snapshot.profile?.displayName ?? "Authorized client"}
        body={`${snapshot.profile?.goal ? `${label(snapshot.profile.goal)} goal · ` : ""}${snapshot.access.mode === "break_glass" ? "Temporary elevated access" : "Active coaching relationship"}`}
        tone="trainer"
        visual={<PrioritySigil count={topSignals.filter((signal) => signal.severity === "attention").length} />}
      >
        {snapshot.access.mode === "break_glass" ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber/35 bg-amber/10 p-3 text-sm text-amber"><ShieldAlert size={18} /> Elevated access is active and audited.</div>
        ) : null}
      </AscendHeroPanel>

      <section className="mt-4" aria-labelledby="current-state-title">
        <p className="ascend-eyebrow text-calm">Ten-second view</p>
        <h2 id="current-state-title" className="mt-1 text-xl font-semibold">Current state</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {training ? <Stat title="Training" value={`${training.completedWorkouts.last7Days} in 7 days`} detail={`Last workout ${relativeTime(training.lastWorkoutAt).toLowerCase()}`} /> : null}
          {nutrition ? <Stat title="Nutrition" value={`${nutrition.last7Days.daysLogged} of 7 days`} detail="Days with nutrition recorded" /> : null}
          {body ? <Stat title="Weight trend" value={trendText(body.weight.trend28d, " kg")} detail={`Updated ${relativeTime(body.weight.currentRecordedAt).toLowerCase()}`} /> : null}
          {activity ? <Stat title="Activity" value={metricValue(activity.averageSteps7d, (value) => `${Math.round(value).toLocaleString()} steps`)} detail={`Synced ${relativeTime(activity.lastSyncedAt).toLowerCase()}`} /> : null}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft" aria-labelledby="signals-title">
        <h2 id="signals-title" className="text-lg font-semibold">Coaching signals</h2>
        <p className="mt-1 text-sm text-zinc-400">Deterministic observations from currently shared data.</p>
        <div className="mt-4"><Signals signals={topSignals} /></div>
      </section>

      <div className="mt-4"><ZoeInsightCard clientId={snapshot.clientId} value={insight} onChange={setInsight} /></div>

      <div className="mt-4 space-y-3">
        <Section id="training" title="Training" icon={<Dumbbell size={19} />} open>
          {!authorized(snapshot, "training") || !training ? <ScopeUnavailable section="Training" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat title="Last 7 days" value={`${training.completedWorkouts.last7Days}`} detail="Workouts recorded" />
                <Stat title="Last 30 days" value={`${training.completedWorkouts.last30Days}`} detail={`${training.averageSessionsPerWeek30d} per week average`} />
                <Stat title="Consistency" value={metricValue(training.loggingConsistency8w, percentage)} detail="Training logging consistency" />
                <Stat title="Frequency" value={trendText(training.frequencyTrend)} detail="Current vs previous 28 days" />
              </div>
              {training.averageDurationMinutes30d.sufficientData ? <p className="text-sm text-zinc-400">Average recorded duration: <span className="text-white">{training.averageDurationMinutes30d.value} minutes</span></p> : null}
              <div>
                <h3 className="font-semibold">Recorded progression</h3>
                {training.exerciseProgression.items.length ? (
                  <div className="mt-2 space-y-2">{training.exerciseProgression.items.slice(0, 4).map((item) => <div key={`${item.exerciseKey}-${item.lastPerformedAt}`} className="rounded-xl border border-line bg-ink/30 p-3"><p className="font-medium">{item.displayName}</p><p className="mt-1 text-sm text-zinc-400">{label(item.status)} · last recorded {relativeTime(item.lastPerformedAt).toLowerCase()}</p></div>)}</div>
                ) : <p className="mt-2 text-sm text-zinc-400">Not enough comparable exercise history yet.</p>}
              </div>
              <div>
                <h3 className="font-semibold">Recent workouts</h3>
                {training.recentWorkouts.length ? <div className="mt-2 space-y-2">{training.recentWorkouts.map((workout) => <div key={workout.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-ink/30 p-3"><div><p className="font-medium">{workout.title}</p><p className="mt-1 text-xs text-zinc-500">{workout.exerciseCount} exercises{workout.recordedSets !== null ? ` · ${workout.recordedSets} sets` : ""}{workout.debriefAvailable ? " · debrief available" : ""}</p></div><p className="shrink-0 text-xs text-zinc-400">{relativeTime(workout.completedAt)}</p></div>)}</div> : <p className="mt-2 text-sm text-zinc-400">No workouts recorded yet.</p>}
              </div>
            </div>
          )}
        </Section>

        <Section id="nutrition" title="Nutrition" icon={<Apple size={19} />}>
          {!authorized(snapshot, "nutrition") || !nutrition ? <ScopeUnavailable section="Nutrition" /> : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Current targets: <span className="text-white">{nutrition.targets.calories} kcal · {nutrition.targets.proteinG} g protein</span></p>
              {(["last7Days", "last30Days"] as const).map((period) => {
                const value = nutrition[period];
                const days = period === "last7Days" ? 7 : 30;
                return <div key={period}><h3 className="font-semibold">Last {days} days</h3><div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat title="Days logged" value={`${value.daysLogged} of ${days}`} detail="Nutrition logging coverage" /><Stat title="Calories" value={metricValue(value.averageCaloriesPerLoggedDay, (entry) => `${Math.round(entry)} kcal`)} detail="Average per logged day" /><Stat title="Protein" value={metricValue(value.averageProteinGPerLoggedDay, (entry) => `${entry} g`)} detail="Average per logged day" /><Stat title="Protein target rate" value={metricValue(value.proteinTargetMetDays, percentage)} detail="Target met on logged days" /></div></div>;
              })}
              <p className="text-xs leading-5 text-zinc-500">Target rates evaluate logged days only. Unlogged days are represented separately by logging coverage.</p>
            </div>
          )}
        </Section>

        <Section id="body-progress" title="Body progress" icon={<Scale size={19} />}>
          {!authorized(snapshot, "bodyProgress") || !body ? <ScopeUnavailable section="Body progress" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat title="Current weight" value={body.weight.currentKg === null ? "Not enough data yet" : `${body.weight.currentKg} kg`} detail={`Updated ${relativeTime(body.weight.currentRecordedAt).toLowerCase()}`} />
                <Stat title="7-day change" value={metricValue(body.weight.change7dKg, (value) => `${value > 0 ? "+" : ""}${value} kg`)} detail={`${body.weight.change7dKg.sampleSize} weigh-ins`} />
                <Stat title="30-day change" value={metricValue(body.weight.change30dKg, (value) => `${value > 0 ? "+" : ""}${value} kg`)} detail={`${body.weight.change30dKg.sampleSize} weigh-ins`} />
                <Stat title="28-day trend" value={trendText(body.weight.trend28d, " kg")} detail={`${body.weight.trend28d.sampleSize} weigh-ins`} />
              </div>
              <div className="rounded-xl border border-line bg-ink/30 p-4">
                <h3 className="font-semibold">Body composition</h3>
                {body.bodyComposition.evidenceStatus === "ESTABLISHED" && body.bodyComposition.establishedChanges.length ? <div className="mt-2 space-y-1">{body.bodyComposition.establishedChanges.map((change) => <p key={change.metric} className="text-sm text-zinc-300">{label(change.metric)}: {change.change > 0 ? "+" : ""}{change.change} ({label(change.signal)})</p>)}</div> : <p className="mt-2 text-sm leading-6 text-zinc-400">No established body-composition change is available. {body.bodyComposition.scanCount ? `Evidence is ${body.bodyComposition.evidenceStatus.toLowerCase()}.` : "No trusted scans yet."}</p>}
              </div>
            </div>
          )}
        </Section>

        <Section id="activity" title="Activity" icon={<HeartPulse size={19} />}>
          {!authorized(snapshot, "activity") || !activity ? <ScopeUnavailable section="Activity" /> : !activity.connected ? <p className="text-sm text-zinc-400">No health activity source is connected.</p> : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat title="Today" value={activity.todaySteps === null ? "Not enough data yet" : `${activity.todaySteps.toLocaleString()} steps`} detail="Recorded steps" />
              <Stat title="7-day average" value={metricValue(activity.averageSteps7d, (value) => `${Math.round(value).toLocaleString()} steps`)} detail={`${activity.averageSteps7d.sampleSize} recorded days`} />
              <Stat title="Sessions" value={`${activity.exerciseSessions7d}`} detail="Activity sessions in 7 days" />
            </div>
          )}
        </Section>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-500">Snapshot generated {relativeTime(snapshot.freshness.generatedAt).toLowerCase()}. Freshness is shown only for shared sections.</p>
    </div>
  );
}

export function Client360Client({ clientId }: { clientId: string }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof getClient360>> | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let mounted = true;
    setError(false);
    setView(null);
    getClient360(clientId).then((value) => mounted && setView(value)).catch(() => mounted && setError(true));
    return () => { mounted = false; };
  }, [clientId, retry]);
  if (!view && !error) return <div className="pb-5"><DashboardHeroSkeleton /><SectionShell title="Current state"><SkeletonStatGrid count={4} /></SectionShell><SectionShell title="Client detail"><SkeletonCardList count={3} compact /></SectionShell></div>;
  if (error) return <div className="mt-4 rounded-2xl border border-amber/35 bg-amber/10 p-5" role="alert"><div className="flex items-start gap-3"><AlertCircle className="text-amber" size={20} /><div><h1 className="font-semibold">Client 360 unavailable</h1><p className="mt-1 text-sm leading-6 text-zinc-300">Access may have changed, Ascend Coach may be disabled, or the page could not be loaded.</p></div></div><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink"><RefreshCw size={18} />Try again</button><Link href="/trainer/clients" className="mt-3 flex min-h-12 items-center justify-center text-sm text-zinc-300">Back to clients</Link></div>;
  return <Client360Content snapshot={view!.snapshot} initialInsight={view!.coachInsight} />;
}
