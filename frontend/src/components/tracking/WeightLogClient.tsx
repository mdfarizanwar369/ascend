"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Save, Scale, Trash2 } from "lucide-react";
import { deleteWeightLog, getMe, getWeightLogs, saveWeightLog } from "@/lib/ascendApi";
import { Field, inputClass } from "@/components/Field";
import { DelightBadge } from "@/components/Delight";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { MetricPulse, ProgressAchievementVisual } from "@/components/ExperienceVisuals";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function WeightLogClient() {
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState<number | null>(null);
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null);
  const [weightHistory, setWeightHistory] = useState<Array<{ id: string; weight_kg: string | number; logged_at: string }>>([]);
  const [status, setStatus] = useState("Loading your latest weight...");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<Awaited<ReturnType<typeof saveWeightLog>>["milestone"]>(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [me, logs] = await Promise.all([getMe(), getWeightLogs()]);
        if (!isMounted) return;

        const latest = logs.weightLogs[0]?.weight_kg ?? me.user.starting_weight_kg;
        const latestNumber = asNumber(latest);
        const targetNumber = asNumber(me.user.target_weight_kg);

        setLatestWeightKg(latestNumber || null);
        setWeightHistory(logs.weightLogs);
        setTargetWeightKg(targetNumber || null);
        setWeightKg(latestNumber ? latestNumber.toFixed(1) : "");
        setStatus("");
      } catch {
        if (isMounted) setStatus("Please log in again if your weight does not load.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("Saving weight...");

    try {
      const saved = await saveWeightLog({ weightKg: Number(weightKg) });
      rememberDashboardRecord("weight", saved.weightLog);
      const nextWeight = asNumber(saved.weightLog.weight_kg);
      setLatestWeightKg(nextWeight);
      setWeightHistory((current) => [{ ...saved.weightLog, weight_kg: nextWeight }, ...current.filter((entry) => entry.logged_at !== saved.weightLog.logged_at)]);
      setWeightKg(nextWeight.toFixed(1));
      setMilestone(saved.milestone ?? null);
      setStatus(saved.milestone ? "Goal achieved. This weigh-in marks a new milestone!" : "Weight saved to Ascend.");
      markInstallEligible("first_action");
    } catch {
      setStatus("Could not save weight. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function removeWeight(id: string) {
    if (!window.confirm("Remove this weight entry? Your remaining history will stay unchanged.")) return;
    setDeletingId(id);
    try {
      await deleteWeightLog(id);
      setWeightHistory((current) => {
        const next = current.filter((entry) => entry.id !== id);
        const latest = next[0] ? asNumber(next[0].weight_kg) : null;
        setLatestWeightKg(latest || null);
        if (latest) setWeightKg(latest.toFixed(1));
        return next;
      });
      setMilestone(null);
      setStatus("Weight entry removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove that weight entry.");
    } finally {
      setDeletingId(null);
    }
  }

  const trend = useMemo(() => {
    const points = weightHistory.slice(0, 12).reverse().map((entry) => asNumber(entry.weight_kg)).filter(Boolean);
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = Math.max(0.5, max - min);
    const coordinates = points.map((value, index) => ({
      x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
      y: 34 - ((value - min) / span) * 28
    }));
    return {
      path: coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      change: points.at(-1)! - points[0]
    };
  }, [weightHistory]);

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow="Daily tracking" title="Weight" disabled={isSaving} />

        <TrackingHero icon={Scale} label="Latest weight" value={<MetricPulse pulseKey={latestWeightKg ?? "empty"}>{latestWeightKg ? `${latestWeightKg.toFixed(1)}kg` : "--"}</MetricPulse>} detail={targetWeightKg ? `Target ${targetWeightKg.toFixed(1)}kg` : "Set a target to see your direction"} tone="lime">
          <DelightBadge tone="lime">{latestWeightKg ? "Progress captured" : "Ready for your first check-in"}</DelightBadge>
          {trend ? (
            <div className="mt-4 border-t border-white/10 pt-4" role="img" aria-label={`Recent weight trend across ${Math.min(weightHistory.length, 12)} entries: ${Math.abs(trend.change).toFixed(1)} kilograms ${trend.change <= 0 ? "down" : "up"}.`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Recent direction</p>
                <p className={`text-sm font-semibold ${trend.change <= 0 ? "text-lime" : "text-amber"}`}>{trend.change > 0 ? "+" : ""}{trend.change.toFixed(1)}kg</p>
              </div>
              <svg className="mt-2 h-10 w-full" viewBox="0 0 100 38" preserveAspectRatio="none" role="img" aria-hidden="true">
                <path d={trend.path} fill="none" stroke="rgb(163 255 70)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          ) : null}
        </TrackingHero>

        {milestone ? (
          <ProgressAchievementVisual
            eyebrow="Goal achieved"
            title={`You reached ${Number(milestone.target_weight_kg).toFixed(1)}kg!`}
            detail="Take the win. Your consistency made this happen."
            action={<a href="/profile/guide" className="ascend-pressable flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink">Choose what comes next</a>}
          />
        ) : null}

        <form onSubmit={onSubmit} className="ascend-surface mt-4 space-y-4 p-4">
          <Field label="Today's weight">
            <div className="relative">
              <input
                className={`${inputClass} pr-12`}
                value={weightKg}
                onChange={(event) => setWeightKg(event.target.value)}
                inputMode="decimal"
                aria-describedby="weight-unit"
                placeholder="81.2"
              />
              <span id="weight-unit" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-zinc-400">kg</span>
            </div>
          </Field>

          <TrackingStatus message={status} success={status.includes("saved") || status.includes("achieved")} actionHref="/dashboard" />

          <button
            type="submit"
            disabled={isSaving || !Number(weightKg)}
            className="ascend-pressable flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save weight"}
          </button>
        </form>

        {weightHistory.length ? (
          <section className="ascend-surface mt-4 p-4">
            <h2 className="text-base font-semibold">Recent weigh-ins</h2>
            <div className="mt-3 space-y-2">
              {weightHistory.slice(0, 8).map((entry) => (
                <div key={entry.id} className="ascend-inset flex min-h-14 items-center gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{asNumber(entry.weight_kg).toFixed(1)}kg</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{new Date(entry.logged_at).toLocaleString()}</p>
                  </div>
                  <button type="button" onClick={() => removeWeight(entry.id)} disabled={deletingId === entry.id} className="ascend-pressable ml-auto grid h-11 w-11 place-items-center rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50" aria-label="Remove weight entry">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
