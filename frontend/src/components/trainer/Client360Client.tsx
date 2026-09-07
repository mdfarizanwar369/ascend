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
import { useI18n } from "@/lib/i18n/I18nProvider";

const DAY_MS = 86_400_000;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function label(value: string | null | undefined, t: Translate) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : t("client360.notAvailable");
}

function relativeTime(value: string | null | undefined, t: Translate) {
  if (!value) return t("client360.noRecentData");
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS));
  if (days === 0) return t("client360.today");
  if (days === 1) return t("client360.yesterday");
  return t("client360.daysAgo", { days });
}

function percentage(value: number | null, t: Translate) {
  return value === null ? t("client360.notEnoughData") : `${Math.round(value * 100)}%`;
}

function metricValue<T>(metric: Client360Metric<T>, format: (value: T) => string, t: Translate) {
  return metric.sufficientData && metric.value !== null ? format(metric.value) : t("client360.notEnoughData");
}

function trendText(trend: Client360Trend, t: Translate, unit = "") {
  if (!trend.sufficientData || trend.direction === "insufficient") return t("client360.notEnoughData");
  const rate = trend.ratePerWeek === null ? "" : ` (${trend.ratePerWeek > 0 ? "+" : ""}${trend.ratePerWeek}${unit}/week)`;
  return `${label(trend.direction, t)}${rate}`;
}

function signalCopy(signal: Client360CoachingSignal, t: Translate) {
  const number = (key: string) => typeof signal.evidence[key] === "number" ? signal.evidence[key] as number : null;
  switch (signal.code) {
    case "TRAINING_INACTIVITY": return t("client360.signalTrainingInactivity", { days: number("daysSinceLastWorkout") ?? t("client360.several") });
    case "TRAINING_FREQUENCY_DECLINING": return t("client360.signalTrainingFrequencyDeclining", { rate: Math.abs(number("ratePerWeek") ?? 0) });
    case "TRAINING_LOGGING_CONSISTENT": return t("client360.signalTrainingConsistent", { activeWeeks: number("activeWeeks") ?? 0, windowWeeks: number("windowWeeks") ?? 8 });
    case "STRENGTH_PROGRESSING": return t("client360.signalStrengthProgressing", { exerciseCount: number("exerciseCount") ?? 0, windowDays: number("windowDays") ?? 30 });
    case "NUTRITION_LOGGING_LOW": return t("client360.signalNutritionLow", { daysLogged: number("daysLogged") ?? 0, windowDays: number("windowDays") ?? 7 });
    case "PROTEIN_TARGET_FREQUENTLY_MISSED": return t("client360.signalProteinMissed", { rate: Math.round((number("targetMetRate") ?? 0) * 100) });
    case "POTENTIAL_WEIGHT_PLATEAU": return t("client360.signalWeightPlateau", { rate: number("rateKgPerWeek") ?? 0, days: number("observedSpanDays") ?? 0 });
  }
}

function signalSeverityLabel(signal: Client360CoachingSignal, t: Translate) {
  if (signal.severity === "attention") return t("client360.needsAttention");
  if (signal.severity === "positive") return t("client360.positive");
  return t("client360.information");
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
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-line bg-ink/30 p-4">
      <p className="text-sm text-zinc-400">{t("client360.scopeUnavailable", { section })}</p>
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
  const { t } = useI18n();
  if (!signals.length) return <p className="text-sm leading-6 text-zinc-400">{t("client360.noSignals")}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {signals.slice(0, 4).map((signal) => (
        <div key={signal.code} className={`rounded-xl border p-3 ${signal.severity === "attention" ? "border-amber/35 bg-amber/10" : signal.severity === "positive" ? "border-lime/30 bg-lime/10" : "border-calm/30 bg-calm/10"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{signalSeverityLabel(signal, t)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">{label(signal.code, t)}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{signalCopy(signal, t)}</p>
        </div>
      ))}
    </div>
  );
}

function ZoeInsightCard({ clientId, value, onChange }: { clientId: string; value: CoachInsightAvailability; onChange: (value: CoachInsightAvailability) => void }) {
  const { t } = useI18n();
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
          <p className="ascend-eyebrow text-purple-200">{t("client360.trainerIntelligence")}</p>
          <h2 id="zoe-insight-title" className="mt-1 text-lg font-semibold">{t("client360.zoeInsight")}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t("client360.zoeRole")}</p>
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
          <p className="mt-3 text-xs text-zinc-500">{relativeTime(value.generatedAt, t)} · {t("client360.cached")}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          {elevated ? t("client360.zoeElevatedUnavailable") : accessRequired ? t("client360.zoeAccessRequired") : failed || value.reason === "generation_failed" ? t("client360.zoeUnavailable") : value.reason === "quota_reached" ? t("client360.zoeQuota") : t("client360.zoeNoInsight")}
        </p>
      )}
      {failed && value.status === "available" ? <p className="mt-3 text-sm text-amber" role="status">{t("client360.zoeUnavailable")}</p> : null}
      {!elevated && !accessRequired ? (
        <button type="button" onClick={refresh} disabled={refreshing} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-purple-300/35 bg-purple-500/15 px-4 font-semibold text-purple-100 disabled:opacity-60" aria-live="polite">
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={18} /> {refreshing ? t("client360.generatingInsight") : value.status === "available" ? t("client360.refreshInsight") : t("client360.generateInsight")}
        </button>
      ) : null}
    </section>
  );
}

function authorized(snapshot: Client360Snapshot, section: Client360Section) {
  return snapshot.access.sections[section].state !== "not_granted";
}

function Client360Content({ snapshot, initialInsight }: { snapshot: Client360Snapshot; initialInsight: CoachInsightAvailability }) {
  const { t } = useI18n();
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
        eyebrow={t("trainer.client360")}
        title={snapshot.profile?.displayName ?? t("client360.authorizedClient")}
        body={`${snapshot.profile?.goal ? `${label(snapshot.profile.goal, t)} goal · ` : ""}${snapshot.access.mode === "platform_owner" ? t("client360.platformOwnerRead") : snapshot.access.mode === "break_glass" ? t("client360.breakGlassRead") : t("client360.activeRelationship")}`}
        tone="trainer"
        visual={<PrioritySigil count={topSignals.filter((signal) => signal.severity === "attention").length} />}
      >
        {snapshot.access.mode === "break_glass" ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber/35 bg-amber/10 p-3 text-sm text-amber"><ShieldAlert size={18} /> {t("client360.breakGlassActive")}</div>
        ) : null}
        {snapshot.access.mode === "platform_owner" ? (
          <div className="flex items-center gap-2 rounded-xl border border-calm/35 bg-calm/10 p-3 text-sm text-calm"><ShieldAlert size={18} /> {t("client360.platformOwnerActive")}</div>
        ) : null}
      </AscendHeroPanel>

      <section className="mt-4" aria-labelledby="current-state-title">
        <p className="ascend-eyebrow text-calm">{t("client360.tenSecondView")}</p>
        <h2 id="current-state-title" className="mt-1 text-xl font-semibold">{t("client360.currentState")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {training ? <Stat title={t("client360.training")} value={`${training.completedWorkouts.last7Days} in 7 days`} detail={`Last workout ${relativeTime(training.lastWorkoutAt, t).toLowerCase()}`} /> : null}
          {nutrition ? <Stat title={t("client360.nutrition")} value={`${nutrition.last7Days.daysLogged} of 7 days`} detail={t("client360.nutritionCoverage")} /> : null}
          {body ? <Stat title={t("client360.weightTrend")} value={trendText(body.weight.trend28d, t, " kg")} detail={`Updated ${relativeTime(body.weight.currentRecordedAt, t).toLowerCase()}`} /> : null}
          {activity ? <Stat title={t("client360.activity")} value={metricValue(activity.averageSteps7d, (value) => `${Math.round(value).toLocaleString()} steps`, t)} detail={`Synced ${relativeTime(activity.lastSyncedAt, t).toLowerCase()}`} /> : null}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft" aria-labelledby="signals-title">
        <h2 id="signals-title" className="text-lg font-semibold">{t("client360.coachingSignals")}</h2>
        <p className="mt-1 text-sm text-zinc-400">{t("client360.deterministicSignals")}</p>
        <div className="mt-4"><Signals signals={topSignals} /></div>
      </section>

      <div className="mt-4"><ZoeInsightCard clientId={snapshot.clientId} value={insight} onChange={setInsight} /></div>

      <div className="mt-4 space-y-3">
        <Section id="training" title={t("client360.training")} icon={<Dumbbell size={19} />} open>
          {!authorized(snapshot, "training") || !training ? <ScopeUnavailable section={t("client360.training")} /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat title={t("client360.last7Days")} value={`${training.completedWorkouts.last7Days}`} detail={t("client360.workoutsRecorded")} />
                <Stat title={t("client360.last30Days")} value={`${training.completedWorkouts.last30Days}`} detail={`${training.averageSessionsPerWeek30d} per week average`} />
                <Stat title={t("client360.consistency")} value={metricValue(training.loggingConsistency8w, (value) => percentage(value, t), t)} detail={t("client360.trainingLoggingConsistency")} />
                <Stat title={t("client360.frequency")} value={trendText(training.frequencyTrend, t)} detail={t("client360.currentVsPrevious")} />
              </div>
              {training.averageDurationMinutes30d.sufficientData ? <p className="text-sm text-zinc-400">{t("client360.averageDuration", { minutes: training.averageDurationMinutes30d.value ?? 0 })}</p> : null}
              <div>
                <h3 className="font-semibold">{t("client360.recordedProgression")}</h3>
                {training.exerciseProgression.items.length ? (
                  <div className="mt-2 space-y-2">{training.exerciseProgression.items.slice(0, 4).map((item) => <div key={`${item.exerciseKey}-${item.lastPerformedAt}`} className="rounded-xl border border-line bg-ink/30 p-3"><p className="font-medium">{item.displayName}</p><p className="mt-1 text-sm text-zinc-400">{label(item.status, t)} · last recorded {relativeTime(item.lastPerformedAt, t).toLowerCase()}</p></div>)}</div>
                ) : <p className="mt-2 text-sm text-zinc-400">{t("client360.notComparableExercise")}</p>}
              </div>
              <div>
                <h3 className="font-semibold">{t("client360.recentWorkouts")}</h3>
                {training.recentWorkouts.length ? <div className="mt-2 space-y-2">{training.recentWorkouts.map((workout) => <div key={workout.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-ink/30 p-3"><div><p className="font-medium">{workout.title}</p><p className="mt-1 text-xs text-zinc-500">{workout.exerciseCount} exercises{workout.recordedSets !== null ? ` · ${workout.recordedSets} sets` : ""}{workout.debriefAvailable ? " · debrief available" : ""}</p></div><p className="shrink-0 text-xs text-zinc-400">{relativeTime(workout.completedAt, t)}</p></div>)}</div> : <p className="mt-2 text-sm text-zinc-400">{t("client360.noWorkouts")}</p>}
              </div>
            </div>
          )}
        </Section>

        <Section id="nutrition" title={t("client360.nutrition")} icon={<Apple size={19} />}>
          {!authorized(snapshot, "nutrition") || !nutrition ? <ScopeUnavailable section={t("client360.nutrition")} /> : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">{t("client360.currentTargets", { calories: nutrition.targets.calories ?? 0, protein: nutrition.targets.proteinG ?? 0 })}</p>
              {(["last7Days", "last30Days"] as const).map((period) => {
                const value = nutrition[period];
                const days = period === "last7Days" ? 7 : 30;
                return <div key={period}><h3 className="font-semibold">{days === 7 ? t("client360.last7Days") : t("client360.last30Days")}</h3><div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat title={t("client360.daysLogged")} value={`${value.daysLogged} of ${days}`} detail={t("client360.nutritionCoverage")} /><Stat title={t("client360.calories")} value={metricValue(value.averageCaloriesPerLoggedDay, (entry) => `${Math.round(entry)} kcal`, t)} detail={t("client360.averageLoggedDay")} /><Stat title={t("client360.protein")} value={metricValue(value.averageProteinGPerLoggedDay, (entry) => `${entry} g`, t)} detail={t("client360.averageLoggedDay")} /><Stat title={t("client360.proteinTargetRate")} value={metricValue(value.proteinTargetMetDays, (entry) => percentage(entry, t), t)} detail={t("client360.targetMetLoggedDays")} /></div></div>;
              })}
              <p className="text-xs leading-5 text-zinc-500">{t("client360.targetRateNote")}</p>
            </div>
          )}
        </Section>

        <Section id="body-progress" title={t("client360.bodyProgress")} icon={<Scale size={19} />}>
          {!authorized(snapshot, "bodyProgress") || !body ? <ScopeUnavailable section={t("client360.bodyProgress")} /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat title={t("client360.currentWeight")} value={body.weight.currentKg === null ? t("client360.notEnoughData") : `${body.weight.currentKg} kg`} detail={relativeTime(body.weight.currentRecordedAt, t)} />
                <Stat title={t("client360.sevenDayChange")} value={metricValue(body.weight.change7dKg, (value) => `${value > 0 ? "+" : ""}${value} kg`, t)} detail={t("client360.weighIns", { count: body.weight.change7dKg.sampleSize })} />
                <Stat title={t("client360.thirtyDayChange")} value={metricValue(body.weight.change30dKg, (value) => `${value > 0 ? "+" : ""}${value} kg`, t)} detail={t("client360.weighIns", { count: body.weight.change30dKg.sampleSize })} />
                <Stat title={t("client360.twentyEightDayTrend")} value={trendText(body.weight.trend28d, t, " kg")} detail={t("client360.weighIns", { count: body.weight.trend28d.sampleSize })} />
              </div>
              <div className="rounded-xl border border-line bg-ink/30 p-4">
                <h3 className="font-semibold">{t("client360.bodyComposition")}</h3>
                {body.bodyComposition.evidenceStatus === "ESTABLISHED" && body.bodyComposition.establishedChanges.length ? <div className="mt-2 space-y-1">{body.bodyComposition.establishedChanges.map((change) => <p key={change.metric} className="text-sm text-zinc-300">{label(change.metric, t)}: {change.change > 0 ? "+" : ""}{change.change} ({label(change.signal, t)})</p>)}</div> : <p className="mt-2 text-sm leading-6 text-zinc-400">{t("client360.noBodyCompositionChange")} {body.bodyComposition.scanCount ? body.bodyComposition.evidenceStatus.toLowerCase() : t("client360.noTrustedScans")}</p>}
              </div>
            </div>
          )}
        </Section>

        <Section id="activity" title={t("client360.activity")} icon={<HeartPulse size={19} />}>
          {!authorized(snapshot, "activity") || !activity ? <ScopeUnavailable section={t("client360.activity")} /> : !activity.connected ? <p className="text-sm text-zinc-400">{t("client360.noActivitySource")}</p> : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat title={t("client360.today")} value={activity.todaySteps === null ? t("client360.notEnoughData") : `${activity.todaySteps.toLocaleString()} steps`} detail={t("client360.recordedSteps")} />
              <Stat title={t("client360.sevenDayAverage")} value={metricValue(activity.averageSteps7d, (value) => `${Math.round(value).toLocaleString()} steps`, t)} detail={t("client360.recordedDays", { count: activity.averageSteps7d.sampleSize })} />
              <Stat title={t("client360.sessions")} value={`${activity.exerciseSessions7d}`} detail={t("client360.activitySessions7d")} />
            </div>
          )}
        </Section>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-500">{t("client360.snapshotFreshness", { time: relativeTime(snapshot.freshness.generatedAt, t).toLowerCase() })}</p>
    </div>
  );
}

export function Client360Client({ clientId }: { clientId: string }) {
  const { t } = useI18n();
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
  if (!view && !error) return <div className="pb-5"><DashboardHeroSkeleton /><SectionShell title={t("client360.currentState")}><SkeletonStatGrid count={4} /></SectionShell><SectionShell title={t("client360.clientDetail")}><SkeletonCardList count={3} compact /></SectionShell></div>;
  if (error) return <div className="mt-4 rounded-2xl border border-amber/35 bg-amber/10 p-5" role="alert"><div className="flex items-start gap-3"><AlertCircle className="text-amber" size={20} /><div><h1 className="font-semibold">{t("client360.client360Unavailable")}</h1><p className="mt-1 text-sm leading-6 text-zinc-300">{t("client360.unavailableDetail")}</p></div></div><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink"><RefreshCw size={18} />{t("common.tryAgain")}</button><Link href="/trainer/clients" className="mt-3 flex min-h-12 items-center justify-center text-sm text-zinc-300">{t("client360.backToClients")}</Link></div>;
  return <Client360Content snapshot={view!.snapshot} initialInsight={view!.coachInsight} />;
}
