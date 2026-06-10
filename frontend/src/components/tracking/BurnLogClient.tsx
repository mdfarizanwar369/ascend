"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Flame, Save } from "lucide-react";
import { getBurnLogs, saveBurnLog } from "@/lib/ascendApi";
import { Field, inputClass } from "@/components/Field";

const burnRates: Record<string, number> = {
  Walking: 4,
  "Strength training": 6,
  Cycling: 8,
  Running: 10,
  "Group class": 7
};

export function BurnLogClient() {
  const [activityType, setActivityType] = useState("Strength training");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [todayCalories, setTodayCalories] = useState(0);
  const [status, setStatus] = useState("Loading today's burn...");
  const [isSaving, setIsSaving] = useState(false);

  const estimatedCalories = useMemo(() => {
    return Math.round((burnRates[activityType] ?? 6) * Number(durationMinutes || 0));
  }, [activityType, durationMinutes]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const logs = await getBurnLogs();
        if (!isMounted) return;

        const today = new Date().toISOString().slice(0, 10);
        const total = logs.burnLogs
          .filter((log) => log.created_at.slice(0, 10) === today)
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("Saving activity...");

    try {
      await saveBurnLog({
        activityType,
        durationMinutes: Number(durationMinutes),
        caloriesBurned: estimatedCalories
      });
      setTodayCalories((current) => current + estimatedCalories);
      setStatus("Activity burn saved to Ascend.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save activity. Please make sure you are logged in.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <a href="/dashboard" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Back to dashboard">
            <ArrowLeft size={19} />
          </a>
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

        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
          <Field label="Activity">
            <select className={inputClass} value={activityType} onChange={(event) => setActivityType(event.target.value)}>
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
              onChange={(event) => setDurationMinutes(event.target.value)}
              inputMode="numeric"
              placeholder="45"
            />
          </Field>

          <div className="rounded-lg bg-ink p-4">
            <p className="text-sm text-zinc-400">Estimated burn</p>
            <p className="mt-1 text-3xl font-semibold">{estimatedCalories} kcal</p>
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
      </div>
    </main>
  );
}
