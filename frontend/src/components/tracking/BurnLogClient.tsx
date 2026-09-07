"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Flame, ListChecks, Save, Trash2, Zap } from "lucide-react";
import { deleteBurnLog, estimateBurnFromText, getBurnLogs, getCurrentCoachHomework, getMe, getMySubscription, saveBurnLog, TrainerHomeworkAssignment } from "@/lib/ascendApi";
import { Field, inputClass, selectClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { usablePlan } from "@/lib/subscriptionPlan";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { trainerHomeworkEnabled } from "@/lib/trainerHomeworkFlag";
import { workoutCaptureEnabled } from "@/lib/workoutCaptureFlag";
import { WorkoutCapturePanel } from "@/components/tracking/WorkoutCapturePanel";
import { trainerSessionCaptureEnabled } from "@/lib/trainerSessionFlag";
import { CoachedSessionsCard } from "@/components/tracking/CoachedSessionsCard";
import { MetricPulse } from "@/components/ExperienceVisuals";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";
import { messages } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type BurnActivityKey = "walking" | "strength_training" | "cycling" | "running" | "group_class";

function english(key: string, values?: Record<string, string | number>) {
  let value = messages.en[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

const burnRates: Record<BurnActivityKey, number> = {
  walking: 4,
  strength_training: 6,
  cycling: 8,
  running: 10,
  group_class: 7
};

function activityLabelKey(activity: BurnActivityKey) {
  return `burn.activity.${activity}`;
}

function normalizeActivityKey(value: string): BurnActivityKey {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("run") || normalized.includes("jog")) return "running";
  if (normalized.includes("walk")) return "walking";
  if (normalized.includes("cycle") || normalized.includes("bike")) return "cycling";
  if (normalized.includes("class") || normalized.includes("hiit") || normalized.includes("zumba")) return "group_class";
  return "strength_training";
}

function understandBurnText(text: string) {
  const lower = text.toLowerCase();
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|km|kilometer|kilometers|k)/);
  const amount = durationMatch ? Number(durationMatch[1]) : 30;
  const unit = durationMatch?.[2] ?? "minutes";

  let activityType: BurnActivityKey = "strength_training";
  if (lower.includes("run") || lower.includes("jog")) activityType = "running";
  if (lower.includes("walk")) activityType = "walking";
  if (lower.includes("cycle") || lower.includes("bike")) activityType = "cycling";
  if (lower.includes("class") || lower.includes("hiit") || lower.includes("zumba")) activityType = "group_class";
  if (lower.includes("gym") || lower.includes("lift") || lower.includes("weight")) activityType = "strength_training";

  const durationMinutes = unit.startsWith("km") || unit === "k" ? Math.round(amount * (activityType === "running" ? 6 : 12)) : Math.round(amount);
  return { activityType, durationMinutes: Math.max(durationMinutes, 1) };
}

export function BurnLogClient() {
  const { t } = useI18n();
  const coachedSessionsEnabled = trainerSessionCaptureEnabled();
  const homeworkFeatureEnabled = trainerHomeworkEnabled();
  const captureFeatureEnabled = workoutCaptureEnabled();
  const canUseDetailedCapture = captureFeatureEnabled;
  const [loggingMode, setLoggingMode] = useState<"quick" | "detailed">("quick");
  const [detailedBusy, setDetailedBusy] = useState(false);
  const [activityType, setActivityType] = useState<BurnActivityKey>("strength_training");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [activityText, setActivityText] = useState("");
  const [todayCalories, setTodayCalories] = useState(0);
  const [todayLogs, setTodayLogs] = useState<Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"]>([]);
  const [aiCalories, setAiCalories] = useState<number | null>(null);
  const [estimateNotes, setEstimateNotes] = useState("");
  const [status, setStatus] = useState(t("burn.loading"));
  const [isSaving, setIsSaving] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [canUseAiEstimate, setCanUseAiEstimate] = useState(false);
  const [homework, setHomework] = useState<TrainerHomeworkAssignment | null>(null);
  const saveLockRef = useRef(false);

  const handleDetailedSaved = useCallback((burnLog: { id: string; metadata: Record<string, unknown>; created_at: string }, calories: number) => {
    rememberDashboardRecord("burn", burnLog);
    setTodayLogs((current) => [burnLog as Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"][number], ...current]);
    setTodayCalories((current) => current + calories);
  }, []);

  const estimatedCalories = useMemo(() => {
    return aiCalories ?? Math.round((burnRates[activityType] ?? 6) * Number(durationMinutes || 0));
  }, [activityType, aiCalories, durationMinutes]);

  async function estimateFromText() {
    if (!canUseAiEstimate) {
      setStatus(t("burn.premiumAiRequired"));
      return;
    }

    const localEstimate = understandBurnText(activityText);
    setIsEstimating(true);
    setActivityType(localEstimate.activityType);
    setDurationMinutes(String(localEstimate.durationMinutes));
    setAiCalories(null);
    setEstimateNotes("");
    setStatus(t("burn.estimating"));

    try {
      const response = await estimateBurnFromText(activityText);
      setActivityType(normalizeActivityKey(response.estimate.activityType));
      setDurationMinutes(String(response.estimate.durationMinutes));
      setAiCalories(response.estimate.caloriesBurned);
      setEstimateNotes(response.estimate.notes ?? "");
      setStatus(t("burn.aiReady"));
    } catch {
      setStatus(t("burn.localEstimateReady", { activity: t(activityLabelKey(localEstimate.activityType)).toLowerCase(), minutes: localEstimate.durationMinutes }));
    } finally {
      setIsEstimating(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const logs = await getBurnLogs();
        if (!isMounted) return;

        const today = localDateKey();
        const todaysLogs = logs.burnLogs.filter((log) => localDateKey(log.created_at) === today);
        const total = todaysLogs
          .reduce((sum, log) => sum + Number(log.metadata?.caloriesBurned ?? 0), 0);

        setTodayLogs(todaysLogs);
        setTodayCalories(total);
        setStatus("");
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : t("burn.loadError"));
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (!homeworkFeatureEnabled) return;
    let isMounted = true;

    getCurrentCoachHomework()
      .then((response) => {
        if (isMounted) setHomework(response.assignment);
      })
      .catch(() => {
        if (isMounted) setHomework(null);
      });

    return () => {
      isMounted = false;
    };
  }, [homeworkFeatureEnabled]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getMySubscription(), getMe()])
      .then(([subscriptionResponse, meResponse]) => {
        if (!isMounted) return;
        const plan = usablePlan(
          subscriptionResponse.subscription.plan,
          subscriptionResponse.subscription.status,
          subscriptionResponse.subscription.current_period_end
        );
        setCanUseAiEstimate(plan === "premium" || plan === "trainer_pro" || meResponse.roles.includes("admin") || meResponse.roles.includes("owner"));
      })
      .catch(() => {
        if (isMounted) {
          setCanUseAiEstimate(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus(t("burn.savingActivity"));

    try {
      const saved = await saveBurnLog({
        activityType: english(activityLabelKey(activityType)),
        durationMinutes: Number(durationMinutes),
        caloriesBurned: estimatedCalories
      });
      rememberDashboardRecord("burn", saved.burnLog);
      setTodayLogs((current) => [saved.burnLog, ...current]);
      setTodayCalories((current) => current + estimatedCalories);
      setStatus(saved.debrief?.enabled && saved.debrief.text
        ? saved.debrief.text
        : t("burn.savedCalories", { activity: t(activityLabelKey(activityType)), calories: estimatedCalories }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("burn.saveError"));
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function removeActivity(log: Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"][number]) {
    if (!window.confirm(t("burn.removeConfirm"))) return;
    setDeletingId(log.id);
    try {
      await deleteBurnLog(log.id);
      const calories = Number(log.metadata?.caloriesBurned ?? log.metadata?.estimatedCaloriesBurned ?? 0);
      setTodayLogs((current) => current.filter((entry) => entry.id !== log.id));
      setTodayCalories((current) => Math.max(0, current - calories));
      setStatus(t("burn.removed"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("burn.removeError"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow={t("burn.dailyTracking")} title={t("burn.movement")} disabled={isSaving || detailedBusy} />

        <TrackingHero icon={Flame} label={t("burn.activityLoggedToday")} value={<MetricPulse pulseKey={todayCalories}>{todayCalories} kcal</MetricPulse>} detail={t("burn.movementAddedToday")} tone="amber" />

        {homework ? (
          <section className="ascend-branded-surface mt-4 rounded-xl border border-calm/30 bg-[linear-gradient(145deg,rgba(61,230,209,0.09),rgba(18,23,33,0.98))] p-4">
            <p className="ascend-eyebrow text-calm">{t("trainer.coachHomework")}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{homework.title}</h2>
            <p className="mt-2 text-sm text-zinc-300">{t("burn.assignedBy", { name: homework.trainer_name ?? t("burn.yourCoach") })}</p>
            <div className="mt-3 space-y-1 text-sm text-zinc-400">
              <p>{t("burn.scheduledFor", { date: new Date(`${homework.assignment_date}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) })}</p>
              <p>{t("burn.dueDate", { date: new Date(`${homework.due_date}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) })}</p>
            </div>
            {homework.coach_note ? (
              <div className="mt-3 rounded-2xl border border-lime/20 bg-lime/10 p-3 text-sm text-zinc-100">
                {t("burn.coachNote", { note: homework.coach_note })}
              </div>
            ) : null}
            <Link
              href={`/coach-homework/${homework.id}`}
              className="ascend-pressable mt-4 flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink"
            >
              {t("burn.startHomework")}
            </Link>
          </section>
        ) : null}

        {canUseDetailedCapture ? (
          <section className="ascend-surface mt-4 p-1" aria-label={t("burn.loggingDepth")}>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setLoggingMode("quick")}
                disabled={detailedBusy}
                aria-pressed={loggingMode === "quick"}
                className={`ascend-pressable flex min-h-14 items-center justify-center gap-2 rounded-[0.65rem] px-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm ${loggingMode === "quick" ? "bg-lime text-ink" : "text-zinc-300"}`}
              >
                <Zap size={18} />
                <span>{t("burn.quickActivity")}</span>
              </button>
              <button
                type="button"
                onClick={() => setLoggingMode("detailed")}
                disabled={isSaving}
                aria-pressed={loggingMode === "detailed"}
                className={`ascend-pressable flex min-h-14 items-center justify-center gap-2 rounded-[0.65rem] px-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm ${loggingMode === "detailed" ? "bg-lime text-ink" : "text-zinc-300"}`}
              >
                <ListChecks size={18} />
                <span>{t("burn.detailedWorkout")}</span>
              </button>
            </div>
          </section>
        ) : null}

        {!canUseDetailedCapture || loggingMode === "quick" ? (
        <form onSubmit={onSubmit} className="ascend-surface mt-4 space-y-4 p-4">
          <Field label={t("burn.tellAscend")}>
            <div className="space-y-2">
            <input
              className={selectClass}
              value={activityText}
                onChange={(event) => {
                  setActivityText(event.target.value);
                  setAiCalories(null);
                  setEstimateNotes("");
                }}
              placeholder={t("burn.exampleActivity")}
              />
              <button
                type="button"
                disabled={isEstimating || !activityText.trim()}
                onClick={estimateFromText}
                className="ascend-pressable h-11 w-full rounded-xl border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
              >
                {isEstimating ? t("burn.estimatingShort") : canUseAiEstimate ? t("burn.estimateWithAi") : t("burn.premiumAiEstimate")}
              </button>
            </div>
          </Field>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("burn.enterYourself")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Field label={t("burn.activity")}>
            <select
              className={selectClass}
              value={activityType}
              onChange={(event) => {
                setActivityType(event.target.value as BurnActivityKey);
                setAiCalories(null);
                setEstimateNotes("");
              }}
            >
              {Object.keys(burnRates).map((activity) => (
                <option key={activity} value={activity}>
                  {t(activityLabelKey(activity as BurnActivityKey))}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("burn.minutes")}>
            <input
              className={inputClass}
              value={durationMinutes}
              onChange={(event) => {
                setDurationMinutes(event.target.value);
                setAiCalories(null);
                setEstimateNotes("");
              }}
              inputMode="numeric"
              placeholder="45"
            />
          </Field>

          <div className="ascend-inset p-4">
            <p className="text-sm text-zinc-400">{t("trainer.estimatedBurn")}</p>
            <p className="mt-1 text-3xl font-semibold">{estimatedCalories} kcal</p>
            {estimateNotes ? <p className="mt-2 text-sm leading-6 text-zinc-400">{estimateNotes}</p> : null}
          </div>

          <TrackingStatus message={status} success={status.includes("saved")} actionHref="/dashboard" />

          <button
            type="submit"
            disabled={isSaving || !Number(durationMinutes)}
            className="ascend-pressable flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? t("common.saving") : t("burn.saveActivity")}
          </button>
        </form>
        ) : (
          <WorkoutCapturePanel onBusyChange={setDetailedBusy} onSaved={handleDetailedSaved} />
        )}
        {todayLogs.length ? (
          <section className="ascend-surface mt-4 p-4">
            <h2 className="text-base font-semibold">{t("burn.todaysMovement")}</h2>
            <div className="mt-3 space-y-2">
              {todayLogs.map((log) => {
                const label = log.metadata?.workoutTitle ?? log.metadata?.activityType ?? t("burn.activity");
                const calories = Number(log.metadata?.caloriesBurned ?? log.metadata?.estimatedCaloriesBurned ?? 0);
                return (
                  <div key={log.id} className="ascend-inset flex min-h-14 items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{label}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{calories} kcal · {new Date(log.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <button type="button" onClick={() => removeActivity(log)} disabled={deletingId === log.id} className="ascend-pressable ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50" aria-label={`Remove ${label}`}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        {coachedSessionsEnabled ? <CoachedSessionsCard /> : null}
      </div>
    </main>
  );
}
