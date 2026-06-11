"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets } from "lucide-react";
import { getWaterLogs, saveWaterLog } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { localDateKey } from "@/lib/date";

const quickAmounts = [250, 500, 750, 1000];
const dailyTargetMl = 2500;

export function WaterLogClient() {
  const [todayMl, setTodayMl] = useState(0);
  const [status, setStatus] = useState("Loading today's water...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const logs = await getWaterLogs();
        if (!isMounted) return;

        const today = localDateKey();
        const total = logs.waterLogs
          .filter((log) => localDateKey(log.logged_at) === today)
          .reduce((sum, log) => sum + log.amount_ml, 0);

        setTodayMl(total);
        setStatus("");
      } catch {
        if (isMounted) setStatus("Please log in again if water tracking does not load.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const progress = useMemo(() => Math.min(100, Math.round((todayMl / dailyTargetMl) * 100)), [todayMl]);

  async function addWater(amountMl: number) {
    setIsSaving(true);
    setStatus(`Saving ${amountMl}ml...`);

    try {
      await saveWaterLog({ amountMl });
      setTodayMl((current) => current + amountMl);
      setStatus(`${amountMl}ml saved to Ascend.`);
    } catch {
      setStatus("Could not save water. Please make sure you are logged in.");
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
            <h1 className="text-2xl font-semibold">Water log</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Today</p>
              <p className="mt-1 text-4xl font-semibold">{(todayMl / 1000).toFixed(1)}L</p>
              <p className="mt-2 text-sm text-zinc-400">Target: 2.5L</p>
            </div>
            <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-calm">
              <div className="text-center">
                <Droplets className="mx-auto text-calm" size={22} />
                <p className="mt-1 text-xl font-semibold">{progress}%</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Quick add</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={isSaving}
                onClick={() => addWater(amount)}
                className="h-16 rounded-lg border border-line bg-ink text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                +{amount >= 1000 ? `${amount / 1000}L` : `${amount}ml`}
              </button>
            ))}
          </div>
        </section>

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}
