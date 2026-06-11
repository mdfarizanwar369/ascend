"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Scale } from "lucide-react";
import { getMe, getWeightLogs, saveWeightLog } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";

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
    setIsSaving(true);
    setStatus("Saving weight...");

    try {
      const saved = await saveWeightLog({ weightKg: Number(weightKg) });
      const nextWeight = asNumber(saved.weightLog.weight_kg);
      setLatestWeightKg(nextWeight);
      setWeightKg(nextWeight.toFixed(1));
      setStatus("Weight saved to Ascend.");
    } catch {
      setStatus("Could not save weight. Please make sure you are logged in.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <div>
            <p className="text-sm text-zinc-400">Daily tracking</p>
            <h1 className="text-2xl font-semibold">Weight log</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
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
        </section>

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
            className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save weight"}
          </button>
        </form>
      </div>
    </main>
  );
}
