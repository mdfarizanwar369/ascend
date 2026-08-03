"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Flame, ListChecks, Save, Zap } from "lucide-react";
import { estimateBurnFromText, getBurnLogs, getCurrentCoachHomework, getMe, getMySubscription, saveBurnLog, TrainerHomeworkAssignment } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { usablePlan } from "@/lib/subscriptionPlan";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { trainerHomeworkEnabled } from "@/lib/trainerHomeworkFlag";
import { workoutCaptureEnabled } from "@/lib/workoutCaptureFlag";
import { WorkoutCapturePanel } from "@/components/tracking/WorkoutCapturePanel";
import { trainerSessionCaptureEnabled } from "@/lib/trainerSessionFlag";
import { CoachedSessionsCard } from "@/components/tracking/CoachedSessionsCard";

const burnRates: Record<string, number> = {
  Walking: 4,
  "Strength training": 6,
  Cycling: 8,
  Running: 10,
  "Group class": 7
};

function understandBurnText(text: string) {
  const lower = text.toLowerCase();
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|km|kilometer|kilometers|k)/);
  const amount = durationMatch ? Number(durationMatch[1]) : 30;
  const unit = durationMatch?.[2] ?? "minutes";

  let activityType = "Strength training";
  if (lower.includes("run") || lower.includes("jog")) activityType = "Running";
  if (lower.includes("walk")) activityType = "Walking";
  if (lower.includes("cycle") || lower.includes("bike")) activityType = "Cycling";
  if (lower.includes("class") || lower.includes("hiit") || lower.includes("zumba")) activityType = "Group class";
  if (lower.includes("gym") || lower.includes("lift") || lower.includes("weight")) activityType = "Strength training";

  const durationMinutes = unit.startsWith("km") || unit === "k" ? Math.round(amount * (activityType === "Running" ? 6 : 12)) : Math.round(amount);
  return { activityType, durationMinutes: Math.max(durationMinutes, 1) };
}

export function BurnLogClient() {
  const coachedSessionsEnabled = trainerSessionCaptureEnabled();
  const homeworkFeatureEnabled = trainerHomeworkEnabled();
  const captureFeatureEnabled = workoutCaptureEnabled();
  const canUseDetailedCapture = captureFeatureEnabled;
  const [loggingMode, setLoggingMode] = useState<"quick" | "detailed">("quick");
  const [detailedBusy, setDetailedBusy] = useState(false);
  const [activityType, setActivityType] = useState("Strength training");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [activityText, setActivityText] = useState("");
  const [todayCalories, setTodayCalories] = useState(0);
  const [aiCalories, setAiCalories] = useState<number | null>(null);
  const [estimateNotes, setEstimateNotes] = useState("");
  const [status, setStatus] = useState("Loading today's burn...");
  const [isSaving, setIsSaving] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [canUseAiEstimate, setCanUseAiEstimate] = useState(false);
  const [homework, setHomework] = useState<TrainerHomeworkAssignment | null>(null);
  const saveLockRef = useRef(false);

  const handleDetailedSaved = useCallback((burnLog: { id: string; metadata: Record<string, unknown>; created_at: string }, calories: number) => {
    rememberDashboardRecord("burn", burnLog);
    setTodayCalories((current) => current + calories);
  }, []);

  const estimatedCalories = useMemo(() => {
    return aiCalories ?? Math.round((burnRates[activityType] ?? 6) * Number(durationMinutes || 0));
  }, [activityType, aiCalories, durationMinutes]);

  async function estimateFromText() {
    if (!canUseAiEstimate) {
      setStatus("Premium is required for AI burn estimates. You can still choose the activity and save it manually.");
      return;
    }

    const localEstimate = understandBurnText(activityText);
    setIsEstimating(true);
    setActivityType(localEstimate.activityType);
    setDurationMinutes(String(localEstimate.durationMinutes));
    setAiCalories(null);
    setEstimateNotes("");
    setStatus("Estimating activity burn...");

    try {
      const response = await estimateBurnFromText(activityText);
      setActivityType(response.estimate.activityType);
      setDurationMinutes(String(response.estimate.durationMinutes));
      setAiCalories(response.estimate.caloriesBurned);
      setEstimateNotes(response.estimate.notes ?? "");
      setStatus("AI burn estimate ready. Review, then save.");
    } catch {
      setStatus(`Estimated ${localEstimate.activityType.toLowerCase()} for ${localEstimate.durationMinutes} minutes. Review, then save.`);
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
        const total = logs.burnLogs
          .filter((log) => localDateKey(log.created_at) === today)
          .reduce((sum, log) => sum + Number(log.metadata?.caloriesBurned ?? 0), 0);

        setTodayCalories(total);
        setStatus("");
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : "Please log in again if activity burn does not load.");
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

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
    setStatus("Saving activity...");

    try {
      const saved = await saveBurnLog({
        activityType,
        durationMinutes: Number(durationMinutes),
        caloriesBurned: estimatedCalories
      });
      rememberDashboardRecord("burn", saved.burnLog);
      setTodayCalories((current) => current + estimatedCalories);
      setStatus("Activity burn saved to Ascend.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save activity. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" disabled={isSaving || detailedBusy} />
          <div>
            <p className="text-sm text-zinc-400">Daily tracking</p>
            <h1 className="text-2xl font-semibold">Activity burn</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink">
              <Flame size={23} />
            </span>
            <div>
              <p className="text-sm text-zinc-400">Burn logged today</p>
              <p className="text-2xl font-semibold">{todayCalories} kcal</p>
            </div>
          </div>
        </section>

        {homework ? (
          <section className="mt-4 rounded-lg border border-calm/30 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.12),transparent_12rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(9,12,18,0.98))] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Coach Homework</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{homework.title}</h2>
            <p className="mt-2 text-sm text-zinc-300">Assigned by {homework.trainer_name ?? "your coach"}</p>
            <div className="mt-3 space-y-1 text-sm text-zinc-400">
              <p>Scheduled for {new Date(`${homework.assignment_date}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
              <p>Due {new Date(`${homework.due_date}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
            </div>
            {homework.coach_note ? (
              <div className="mt-3 rounded-2xl border border-lime/20 bg-lime/10 p-3 text-sm text-zinc-100">
                Coach note: {homework.coach_note}
              </div>
            ) : null}
            <Link
              href={`/coach-homework/${homework.id}`}
              className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-lime font-semibold text-ink"
            >
              Start Homework
            </Link>
          </section>
        ) : null}

        {canUseDetailedCapture ? (
          <section className="mt-4 rounded-lg border border-line bg-surface p-1" aria-label="Movement logging depth">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setLoggingMode("quick")}
                disabled={detailedBusy}
                aria-pressed={loggingMode === "quick"}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm ${loggingMode === "quick" ? "bg-lime text-ink" : "bg-ink text-zinc-300"}`}
              >
                <Zap size={18} />
                <span>Quick Activity</span>
              </button>
              <button
                type="button"
                onClick={() => setLoggingMode("detailed")}
                disabled={isSaving}
                aria-pressed={loggingMode === "detailed"}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm ${loggingMode === "detailed" ? "bg-lime text-ink" : "bg-ink text-zinc-300"}`}
              >
                <ListChecks size={18} />
                <span>Detailed Workout</span>
              </button>
            </div>
          </section>
        ) : null}

        {!canUseDetailedCapture || loggingMode === "quick" ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
          <Field label="Tell Ascend what you did">
            <div className="space-y-2">
            <input
              className={selectClass}
              value={activityText}
                onChange={(event) => {
                  setActivityText(event.target.value);
                  setAiCalories(null);
                  setEstimateNotes("");
                }}
              placeholder="Ran 30 minutes"
              />
              <button
                type="button"
                disabled={isEstimating || !activityText.trim()}
                onClick={estimateFromText}
                className="h-11 w-full rounded-lg border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
              >
                {isEstimating ? "Estimating..." : canUseAiEstimate ? "Estimate with AI" : "Premium AI estimate"}
              </button>
            </div>
          </Field>

          <Field label="Activity">
            <select
              className={selectClass}
              value={activityType}
              onChange={(event) => {
                setActivityType(event.target.value);
                setAiCalories(null);
                setEstimateNotes("");
              }}
            >
              {Object.keys(burnRates).map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Minutes">
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

          <div className="rounded-lg bg-ink p-4">
            <p className="text-sm text-zinc-400">Estimated burn</p>
            <p className="mt-1 text-3xl font-semibold">{estimatedCalories} kcal</p>
            {estimateNotes ? <p className="mt-2 text-sm leading-6 text-zinc-400">{estimateNotes}</p> : null}
          </div>

          {status ? <p className="rounded-lg border border-line bg-ink p-3 text-sm text-zinc-300">{status}</p> : null}

          <button
            type="submit"
            disabled={isSaving || !Number(durationMinutes)}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save activity"}
          </button>
        </form>
        ) : (
          <WorkoutCapturePanel onBusyChange={setDetailedBusy} onSaved={handleDetailedSaved} />
        )}
        {coachedSessionsEnabled ? <CoachedSessionsCard /> : null}
      </div>
    </main>
  );
}
