"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Droplets, Trash2 } from "lucide-react";
import { deleteWaterLog, getWaterLogs, saveWaterLog } from "@/lib/ascendApi";
import { DelightBadge } from "@/components/Delight";
import { localDateKey } from "@/lib/date";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { MetricPulse } from "@/components/ExperienceVisuals";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";

const quickAmounts = [250, 500, 750, 1000];
const dailyTargetMl = 2500;

export function WaterLogClient() {
  const [todayMl, setTodayMl] = useState(0);
  const [todayLogs, setTodayLogs] = useState<Array<{ id: string; amount_ml: number; logged_at: string }>>([]);
  const [status, setStatus] = useState("Loading today's water...");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const logs = await getWaterLogs();
        if (!isMounted) return;

        const today = localDateKey();
        const todaysLogs = logs.waterLogs.filter((log) => localDateKey(log.logged_at) === today);
        const total = todaysLogs
          .reduce((sum, log) => sum + log.amount_ml, 0);

        setTodayLogs(todaysLogs);
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
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setSaveSucceeded(false);
    setStatus(`Saving ${amountMl}ml...`);

    try {
      const saved = await saveWaterLog({ amountMl });
      rememberDashboardRecord("water", saved.waterLog);
      setTodayLogs((current) => [saved.waterLog, ...current]);
      const nextTotal = todayMl + amountMl;
      setTodayMl(nextTotal);
      const remainingMl = Math.max(dailyTargetMl - nextTotal, 0);
      setStatus(remainingMl ? `${(nextTotal / 1000).toFixed(1)}L today. ${(remainingMl / 1000).toFixed(1)}L to your guide.` : "Hydration goal complete for today.");
      setSaveSucceeded(true);
      markInstallEligible("first_action");
    } catch {
      setSaveSucceeded(false);
      setStatus("Could not save water. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function removeWater(log: { id: string; amount_ml: number }) {
    if (!window.confirm(`Remove this ${log.amount_ml}ml water entry?`)) return;
    setDeletingId(log.id);
    try {
      await deleteWaterLog(log.id);
      setTodayLogs((current) => current.filter((entry) => entry.id !== log.id));
      setTodayMl((current) => Math.max(0, current - log.amount_ml));
      setSaveSucceeded(false);
      setStatus("Water entry removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove that water entry.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow="Daily tracking" title="Water" disabled={isSaving} />

        <TrackingHero icon={Droplets} label="Hydration today" value={<MetricPulse pulseKey={todayMl}>{(todayMl / 1000).toFixed(1)}L</MetricPulse>} detail="2.5L daily guide" progress={progress} tone="teal">
          <DelightBadge tone={progress >= 100 ? "lime" : "teal"}>{progress >= 100 ? "Hydration goal complete" : "Every glass moves you forward"}</DelightBadge>
        </TrackingHero>

        <section className="ascend-surface mt-4 p-4">
          <p className="text-base font-semibold">Add water</p>
          <p className="mt-1 text-sm text-zinc-400">Choose the amount you just finished.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={isSaving}
                onClick={() => addWater(amount)}
                className="ascend-pressable ascend-inset h-16 text-lg font-semibold text-white hover:border-calm/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                +{amount >= 1000 ? `${amount / 1000}L` : `${amount}ml`}
              </button>
            ))}
          </div>
        </section>

        <TrackingStatus message={status} success={saveSucceeded} actionHref="/dashboard" />

        {todayLogs.length ? (
          <section className="ascend-surface mt-4 p-4">
            <h2 className="text-base font-semibold">Today&apos;s water</h2>
            <div className="mt-3 space-y-2">
              {todayLogs.map((log) => (
                <div key={log.id} className="ascend-inset flex min-h-14 items-center gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{log.amount_ml >= 1000 ? `${log.amount_ml / 1000}L` : `${log.amount_ml}ml`}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{new Date(log.logged_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                  <button type="button" onClick={() => removeWater(log)} disabled={deletingId === log.id} className="ascend-pressable ml-auto grid h-11 w-11 place-items-center rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50" aria-label={`Remove ${log.amount_ml} millilitre water entry`}>
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
