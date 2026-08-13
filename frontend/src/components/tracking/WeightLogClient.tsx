"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Save, Scale } from "lucide-react";
import { getMe, getWeightLogs, saveWeightLog } from "@/lib/ascendApi";
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
  const [status, setStatus] = useState("Loading your latest weight...");
  const [isSaving, setIsSaving] = useState(false);
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

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow="Daily tracking" title="Weight" disabled={isSaving} />

        <TrackingHero icon={Scale} label="Latest weight" value={<MetricPulse pulseKey={latestWeightKg ?? "empty"}>{latestWeightKg ? `${latestWeightKg.toFixed(1)}kg` : "--"}</MetricPulse>} detail={targetWeightKg ? `Target ${targetWeightKg.toFixed(1)}kg` : "Set a target to see your direction"} tone="lime">
          <DelightBadge tone="lime">{latestWeightKg ? "Progress captured" : "Ready for your first check-in"}</DelightBadge>
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
            <input
              className={inputClass}
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
              inputMode="decimal"
              placeholder="81.2"
            />
          </Field>

          <TrackingStatus message={status} success={status.includes("saved") || status.includes("achieved")} />

          <button
            type="submit"
            disabled={isSaving || !Number(weightKg)}
            className="ascend-pressable flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save weight"}
          </button>
        </form>
      </div>
    </main>
  );
}
