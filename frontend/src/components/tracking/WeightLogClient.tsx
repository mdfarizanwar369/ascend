"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Save, Scale } from "lucide-react";
import { getMe, getWeightLogs, saveWeightLog } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";
import { DelightBadge } from "@/components/Delight";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";

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
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" disabled={isSaving} />
          <div>
            <p className="text-sm text-zinc-400">Daily tracking</p>
            <h1 className="text-2xl font-semibold">Weight log</h1>
          </div>
        </header>

        <section className="ascend-soft-enter mt-4 rounded-2xl border border-lime/30 bg-gradient-to-br from-lime/10 via-surface to-calm/10 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink">
              <Scale size={23} />
            </span>
            <div>
              <p className="text-sm text-zinc-400">Latest weight</p>
              <p className="text-2xl font-semibold">{latestWeightKg ? `${latestWeightKg.toFixed(1)}kg` : "--"}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            {targetWeightKg ? `Target: ${targetWeightKg.toFixed(1)}kg` : "Set a target during onboarding to track progress."}
          </p>
          <div className="mt-3">
            <DelightBadge tone="lime">{latestWeightKg ? "Progress captured" : "Ready for your first check-in"}</DelightBadge>
          </div>
        </section>

        {milestone ? (
          <section className="mt-4 rounded-lg border border-lime bg-lime/15 p-4 text-center">
            <p className="text-sm font-semibold uppercase text-lime">Goal achieved</p>
            <h2 className="mt-2 text-2xl font-semibold">You reached {Number(milestone.target_weight_kg).toFixed(1)}kg!</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">Take the win. Your consistency made this happen.</p>
            <a href="/profile/guide" className="ascend-pressable mt-4 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
              Choose what comes next
            </a>
          </section>
        ) : null}

        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
          <Field label="Today's weight">
            <input
              className={inputClass}
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
              inputMode="decimal"
              placeholder="81.2"
            />
          </Field>

          {status ? <p className="rounded-lg border border-line bg-ink p-3 text-sm text-zinc-300">{status}</p> : null}

          <button
            type="submit"
            disabled={isSaving || !Number(weightKg)}
            className="ascend-pressable flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save weight"}
          </button>
        </form>
      </div>
    </main>
  );
}
